# Security Implementation - SharedVpc Component

## Overview

This document details the security controls implemented in the `SharedVpc` component to ensure defense-in-depth, zero-trust networking, and compliance with ISO27001/HIPAA requirements.

---

## Defense-in-Depth Architecture

### Layer 1: Network ACLs (NACLs) - Network Layer

**Location**: [`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), `SharedVpc` constructor, NETWORK ACLs section

**Purpose**: Stateless, subnet-level traffic filtering (defense against misconfigured security groups)

**Implementation**: one NACL per tier. With `enableIpv6`, every IPv4 entry has an IPv6
counterpart numbered **+1000** (NACL rule numbers share one space per direction across IPv4 and
IPv6; the offset also stays clear of the entries consumers add at stack level, e.g. iac-worx
90–150).

| Tier | Dir | IPv4 | IPv6 (`enableIpv6`) |
|---|---|---|---|
| public | in | 95: all from the VPC CIDR | 1095: all from the VPC's IPv6 block |
| public | in | 100: TCP 443 from 0.0.0.0/0 | 1100: TCP 443 from ::/0 — only with `allowIpv6PublicIngress` |
| public | in | 110: TCP 80 from 0.0.0.0/0 | 1110: TCP 80 from ::/0 — only with `allowIpv6PublicIngress` |
| public | in | 120: TCP 1024–65535 from 0.0.0.0/0 | 1120: TCP 1024–65535 from ::/0 |
| private/data | in | 100: all from the VPC CIDR | 1100: all from the VPC's IPv6 block |
| private/data | in | 110: TCP 1024–65535 from 0.0.0.0/0 | 1110: TCP 1024–65535 from ::/0 |
| every tier | in | — | 1130: UDP 1024–65535 from ::/0 (return traffic) |
| every tier | in | — | 1150: ICMPv6 type 2, Packet Too Big, from ::/0 |
| every tier | out | 100: all to 0.0.0.0/0 | 1100: all to ::/0 |

ICMPv6 Packet Too Big is mandatory: IPv6 routers do not fragment, so dropping it black-holes
large packets (path-MTU discovery). 1130 and 1150 are the IPv6 counterparts of the IPv4 UDP-return
(130) and ICMP-unreachable (150) entries iac-worx adds to its ZTNA connectors' tier.

**Security Benefits**:
- ✅ **Defense-in-depth**: Protects even if security groups misconfigured
- ✅ **Public tier**: internet-initiated inbound limited to 443/80 over IPv4, and over IPv6 only on opt-in for a production-facing edge; otherwise the VPC itself plus return traffic for the tier's own egress
- ✅ **Private tier**: Only VPC-internal traffic + return traffic (blocks direct internet inbound)
- ✅ **Stateless**: Independent of connection state (can't be bypassed by connection hijacking)
- ✅ **Per-tier isolation**: Supports custom tiers (e.g., HIPAA data tier with stricter rules)

**Limitations**:
- ⚠️ Being stateless, the ephemeral return entries admit any TCP (and, for IPv6, UDP) packet to
  ports 1024–65535 from anywhere. Security groups, which are stateful, are what refuse unsolicited
  connections to those ports.
- ⚠️ No deny rules for known bad actors (future: integrate with threat intelligence)
- ⚠️ No geo-blocking (future: AWS Network Firewall for geo-restrictions)
- ⚠️ No rate limiting (future: AWS WAF for application-layer rate limits)

---

### Layer 2: Security Groups - Instance Layer

**Location**: [`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), SECURITY RESOURCES section (`vpcEndpointSg`)

**Purpose**: Stateful, instance-level traffic filtering (controls access to VPC endpoints)

**Implementation**:

```typescript
// Security group for VPC interface endpoints
const vpcEndpointSg = new aws.ec2.SecurityGroup({
  vpcId: vpc.id,
  description: "Security group for VPC interface endpoints",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: [args.vpcCidr],
      description: "HTTPS from VPC",
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
      description: "Allow all outbound",
    },
  ],
});
```

**Security Benefits**:
- ✅ **Least privilege**: Only HTTPS (443) inbound from VPC CIDR
- ✅ **No public access**: VPC CIDR only (blocks internet-originated requests)
- ✅ **Stateful**: Return traffic automatically allowed (no need for ephemeral port rules)
- ✅ **Compliance-ready**: Tagged for audit trail (`Purpose: vpc-endpoints`)

**Limitations**:
- ⚠️ Generic SG for all interface endpoints (future: per-endpoint SGs for fine-grained control)
- ⚠️ No source security group filtering (future: restrict to specific app security groups)

---

### Layer 3: VPC Endpoints - Service Layer

**Location**: [`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), SECURITY RESOURCES section (`gatewayEndpoints`, `interfaceEndpoints`, `ipAddressTypeOf`)

**Purpose**: PrivateLink isolation for AWS service communication (no internet traversal)

**Implementation**:

```typescript
// Gateway endpoints (free, route table associations)
const gatewayEndpoints = ["s3", "dynamodb"];
gatewayEndpoints.forEach((service) => {
  if (args.vpcEndpoints?.includes(service) === true) {
    new aws.ec2.VpcEndpoint({
      vpcId: vpc.id,
      serviceName: `com.amazonaws.${args.region}.${service}`,
      vpcEndpointType: "Gateway",
      routeTableIds: pulumi.all(allRouteTableIds),
    });
  }
});

// Interface endpoints (cost $, subnet-specific, private DNS)
interfaceEndpoints.forEach((service) => {
  new aws.ec2.VpcEndpoint({
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${args.region}.${service}`,
    vpcEndpointType: "Interface",
    subnetIds: privateSubnets.map((s) => s.id),
    securityGroupIds: [vpcEndpointSg.id],
    privateDnsEnabled: true,
  });
});
```

**Security Benefits**:
- ✅ **Zero-trust**: S3/DynamoDB traffic never leaves AWS network (gateway endpoints, FREE)
- ✅ **PrivateLink**: ECR, Secrets Manager, SSM use private IPs (interface endpoints, ~$7/mo each)
- ✅ **Private DNS**: Seamless AWS SDK integration (no code changes needed)
- ✅ **VPC-only access**: Security group restricts to VPC CIDR only
- ✅ **Audit trail**: VPC flow logs capture endpoint traffic

**Cost Guidance**:
- Gateway endpoints (S3, DynamoDB): **FREE**
- Interface endpoints (ECR, Secrets, SSM): **~$7-10/month each**
- **Recommended MVP endpoints**: `s3`, `dynamodb`, `ecr.api`, `ecr.dkr`, `logs`, `secretsmanager`
- **Total MVP cost**: ~$30-40/month (vs $0 for internet route - worth it for security)

**Limitations**:
- ⚠️ Interface endpoints have cost (need cost/benefit analysis per service)
- ⚠️ Not all AWS services support VPC endpoints (future: document unsupported services)
- ⚠️ Gateway endpoints update all route tables (can't be per-tier selective)

---

### Layer 4: VPC Flow Logs - Audit Layer

**Location**: [`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), OPERATIONS RESOURCES section (`flowLogsBucket`, `aws.ec2.FlowLog`)

**Purpose**: Audit trail for all network traffic (compliance + forensics)

**Implementation**:

```typescript
// S3 bucket for flow logs (encrypted, versioned, lifecycle policy)
const flowLogsBucket = new aws.s3.BucketV2({
  bucket: `${args.orgPrefix}-flow-logs-${args.accountId}-${args.region}`,
});

// Enable versioning + encryption + public access block
new aws.s3.BucketVersioningV2({ bucket: flowLogsBucket.id });
new aws.s3.BucketServerSideEncryptionConfigurationV2({ bucket: flowLogsBucket.id });
new aws.s3.BucketPublicAccessBlock({ bucket: flowLogsBucket.id });

// Lifecycle policy for retention
new aws.s3.BucketLifecycleConfigurationV2({
  bucket: flowLogsBucket.id,
  rules: [{ expiration: { days: args.flowLogs.retentionDays } }],
});

// VPC Flow Logs to S3
new aws.ec2.FlowLog({
  vpcId: vpc.id,
  logDestinationType: "s3",
  logDestination: pulumi.interpolate`arn:aws:s3:::${flowLogsBucket.bucket}/vpc-flow-logs/`,
  trafficType: args.flowLogs.trafficType,
});
```

**Security Benefits**:
- ✅ **Compliance**: ISO27001/HIPAA require network traffic audit logs
- ✅ **Forensics**: Investigate security incidents (who accessed what, when)
- ✅ **Threat detection**: GuardDuty analyzes flow logs for anomalies
- ✅ **Configurable**: Traffic type (ALL, ACCEPT, REJECT) via Infisical
- ✅ **Retention**: Configurable retention days via Infisical

**Limitations**:
- ⚠️ No real-time alerting (future: Lambda + EventBridge for anomaly detection)
- ⚠️ S3 storage costs scale with traffic volume (consider CloudWatch Logs for lower retention)
- ⚠️ Logs are delayed ~10-15 minutes (not real-time)

---

## Zero-Trust Principles

### 1. No Direct Internet Access for Private Subnets

**Implementation**:
- Private subnets route IPv4 egress through NAT Gateways (public subnet), and IPv6 egress
  (`enableIpv6`) through an egress-only internet gateway, which admits no inbound connections
- NACLs block direct internet inbound traffic (return traffic only)
- VPC endpoints for AWS services (no internet traversal)

**Validation**:
- Private subnet route table has NO `0.0.0.0/0 → igw-*` and NO `::/0 → igw-*` route
- All AWS service traffic routes through VPC endpoints
- NACL blocks all inbound except the VPC's own blocks + return traffic

### 2. Least Privilege Access

**Implementation**:
- VPC endpoint security group: VPC CIDR only (no 0.0.0.0/0)
- NACLs: Public tier allows the VPC CIDR (rule 95) plus HTTP/HTTPS and ephemeral from the internet; Private tier allows only VPC (rule 100) + ephemeral
- Flow logs: Audit all traffic (detect unexpected patterns)

**Validation**:
- No security group has `0.0.0.0/0` ingress (except public tier load balancers)
- No private subnet has direct internet access
- All AWS service access via VPC endpoints (logged in flow logs)

### 3. Defense-in-Depth

**Layers**:
1. Network ACLs (stateless, subnet-level)
2. Security Groups (stateful, instance-level)
3. VPC Endpoints (service-level isolation)
4. Flow Logs (audit layer)

**Validation**:
- Compromised security group still blocked by NACL
- Compromised instance still isolated by VPC endpoints
- All traffic logged for forensics

---

## Compliance Mapping

### ISO27001 Controls

| Control | Requirement | Implementation |
|---------|-------------|----------------|
| **A.13.1.1** | Network controls | NACLs + Security Groups provide network segregation |
| **A.13.1.2** | Security of network services | VPC endpoints enforce secure AWS service communication |
| **A.13.1.3** | Segregation in networks | Per-tier NACLs support compliance-based isolation (e.g., HIPAA data tier) |

### HIPAA/HITRUST (Future care tenant)

| Requirement | Implementation |
|-------------|----------------|
| PHI doesn't traverse public internet | VPC endpoints ensure all AWS service traffic stays within AWS network |
| Network-layer isolation for PHI | Dedicated HIPAA data tier with stricter NACL rules (VPC-only, no internet) |
| Audit trail for network access | VPC flow logs capture all traffic to/from HIPAA data tier |

---

## Testing Recommendations

### Unit Tests (iac-worx)

**Add tests for**:
- [ ] VPC endpoint creation (gateway vs interface types)
- [ ] NACL rule generation per tier (public vs private)
- [ ] Security group ingress/egress rules for VPC endpoints
- [ ] Route table associations for gateway endpoints

**Example Test**:
```typescript
it("should create gateway endpoint for S3 with all route tables", () => {
  const vpcEndpoints = ["s3", "dynamodb"];
  const result = SharedVpc.create({ vpcEndpoints });
  expect(result.endpoints.filter(e => e.type === "Gateway")).toHaveLength(2);
  expect(result.endpoints[0].routeTableIds).toEqual(allRouteTableIds);
});
```

### Integration Tests

**Manual validation**:
1. Deploy VPC with endpoints enabled: `pulumi up`
2. Launch EC2 in private subnet
3. Test S3 access: `aws s3 ls` (should use gateway endpoint, check flow logs)
4. Test ECR pull: `docker pull ecr.us-east-1.amazonaws.com/...` (should use interface endpoint)
5. Verify no internet route: `aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-xxx"`

### Security Tests

**Recommended validation**:
1. Attempt to access VPC endpoint from outside VPC (should fail - security group blocks)
2. Attempt to SSH to private subnet from internet (should fail - NACL blocks)
3. Verify flow logs capture all traffic: `aws s3 ls s3://...-flow-logs/vpc-flow-logs/`
4. Run AWS Trusted Advisor security checks
5. Run AWS Config rules for VPC security baseline

---

## Known Limitations

### 1. NACL Rules Are Basic

**Current State**: Simple allow rules for HTTP/HTTPS (public) and VPC-internal (private).

**Limitation**: No deny rules for known bad actors, no geo-blocking, no rate limiting.

**Recommendation**: For production:
- AWS Network Firewall for deep packet inspection ($0.395/hr + $0.065/GB = ~$300/mo)
- AWS WAF for application-layer protection ($5/mo + $1/rule + $0.60/million requests)
- GuardDuty for threat detection ($4-5/mo for VPC flow logs analysis)

### 2. VPC Endpoint Costs

**Current State**: Interface endpoints cost ~$7/month each + data transfer.

**Optimization**:
- Use gateway endpoints where available (S3, DynamoDB - FREE)
- Add interface endpoints incrementally as needed (ECR first, then Secrets, then SSM)
- Monitor data transfer costs (charged separately from endpoint hourly cost)

### 3. No DDoS Protection

**Current State**: Standard AWS DDoS protection (Network ACLs + AWS Shield Standard - FREE).

**Limitation**: No advanced DDoS protection.

**Recommendation**: For production:
- AWS Shield Advanced ($3,000/month) for DDoS protection + 24/7 DDoS Response Team
- AWS WAF rate limiting rules ($1/rule + $0.60/million requests)
- CloudFront + Route 53 for edge protection (already included in infrastructure)

### 4. No Intrusion Detection

**Current State**: Flow logs provide audit trail, but no real-time detection.

**Recommendation**: For production:
- AWS GuardDuty ($4-5/month for VPC flow logs analysis) - HIGHLY RECOMMENDED
- Security Hub for centralized findings ($0.0010/finding = ~$10-20/mo)
- EventBridge rules for alerting (FREE)

---

## Next Steps

### Immediate (Pre-MVP)

- [ ] Add unit tests for VPC endpoints and NACLs
- [ ] Update iac-worx VPC stack documentation with architecture diagrams
- [ ] Review VPC endpoint list with devops team (cost vs security tradeoff)
- [ ] Deploy to dev environment and validate connectivity

### Short-Term (Post-MVP)

- [ ] Enable GuardDuty for threat detection (~$5/mo)
- [ ] Configure AWS Config rules for VPC compliance (FREE in AWS GovCloud, $0.003/rule elsewhere)
- [ ] Set up CloudWatch alarms for unusual network traffic (FREE within limits)
- [ ] Document NACL customization patterns for specific workloads

### Long-Term (care tenant launch)

- [ ] Add AWS Network Firewall for deep packet inspection (~$300/mo)
- [ ] Implement AWS WAF for application-layer protection (~$20-50/mo)
- [ ] Configure AWS Shield Advanced if DDoS risk is high ($3,000/mo - enterprise only)
- [ ] Set up Security Hub for centralized compliance reporting (~$10-20/mo)

---

## References

- [AWS VPC Endpoints Documentation](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints.html)
- [AWS Network ACLs Best Practices](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
- [AWS Security Best Practices](https://docs.aws.amazon.com/whitepapers/latest/aws-overview-security-processes/aws-security-best-practices.html)
- [ISO27001:A.13.1 - Network Security Management](https://www.isms.online/iso-27001/annex-a-13-communications-security/)
- [HIPAA Security Rule - Network Security](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)

---

## Additional Security Fixes (High-Severity Issues)

### 1. Egress Validation - Private Tiers Need an Egress Path ✅

**Issue**: If `natGatewayCount=0` and `enableIpv6=false`, private subnets have zero internet access. Deployments succeed but workloads fail at runtime (silent failure).

**Fix**: construction fails with:

```
Invalid configuration: private tiers have no internet egress (natGatewayCount is 0 and IPv6 is
disabled). Fix: set natGatewayCount>0 (IPv4 egress via NAT gateways). enableIpv6=true alone gives
IPv6-only egress, which cannot reach IPv4-only destinations (e.g. github.com, ghcr.io); it is
valid only when private-tier workloads use VPC endpoints or IPv6-capable destinations exclusively.
```

`enableIpv6=true` with `natGatewayCount=0` is accepted, with a warning that states the same limit
(see [IPv6-only egress](#9-ipv6-only-egress-no-dns64nat64)).

---

### 2. IPv6 Dual-Stack and Public Ingress Control ✅

**`enableIpv6: true` is dual-stack on everything**:

- The VPC gets an Amazon-provided /56.
- Every subnet of every tier gets a /64 and assigns IPv6 addresses to new network interfaces
  (`assignIpv6AddressOnCreation`). The /64 is `netnum = ipv6Slot * 16 + azIndex`: `ipv6Slot` is
  explicit per tier (0–15, unique; required with IPv6; the default tiers use public 0, private 1,
  data 2) and `azIndex` comes from the AZ letter (a=0 … p=15). Neither depends on list order, so
  adding an AZ or a tier never renumbers an existing subnet. Never change a live tier's slot.
- Every tier NACL carries IPv6 rules (Layer 1 table).
- Public tiers route `::/0` to the internet gateway; private tiers route `::/0` to an egress-only
  internet gateway, with or without NAT gateways.
- VPC endpoints are `dualstack` where the service supports IPv6 (read from
  DescribeVpcEndpointServices at deploy time and logged per service), `ipv4` otherwise. The
  endpoint security group admits 443 from the VPC's IPv4 and IPv6 blocks.
- Outputs: `vpcIpv6CidrBlock`, `subnetIpv6CidrBlocks` (tier → /64s in AZ order),
  `egressOnlyInternetGatewayId`.

Adding the /64 to an existing subnet is an in-place `AssociateSubnetCidrBlock` (the provider's
`ipv6_cidr_block` is not ForceNew), never a replacement. Existing network interfaces do not gain
an IPv6 address; new ones do (redeploy tasks, or assign addresses to instances explicitly).

**`allowIpv6PublicIngress`** (default **`false`**):

The posture the default encodes: **no internet-initiated inbound; required egress with its return
traffic.** Non-production environments are never reachable from the internet; operators and
services reach them through ZTNA. The default holds that posture over IPv6 as well as IPv4.

- The public `::/0 → IGW` route exists whenever IPv6 is on, because it is the public tiers' IPv6
  egress. With the route in place, the NACL and the security groups are what keep internet-initiated
  IPv6 connections out.
- `false` (default, and the only setting for non-production): the public NACL admits over IPv6
  only the VPC's IPv6 block, ephemeral TCP/UDP return traffic for the tier's own egress, and ICMPv6
  Packet Too Big (path-MTU discovery for that egress).
- `true`: also admits TCP 443 and 80 from `::/0`, mirroring the IPv4 rules. Opt in only for a
  production-facing edge (e.g. a public load balancer) that must accept internet-initiated IPv6
  connections; it is not a normal pattern.
- Being stateless, the return-traffic entries admit any packet to ports 1024–65535; security
  groups (stateful, no ingress from `::/0`) refuse unsolicited connections. The flag is an extra
  NACL layer, not a substitute.

**Before 0.4.0** the flag defaulted to `true` and gated the public `::/0` route itself, which
removed the public tiers' IPv6 egress when set to `false`; subnets had no IPv6 addresses at all,
so neither setting had any effect in practice.

---

### 3. Flow Log Format Customization for Security ✅

**Issue**: Flow logs use default AWS format (missing critical security fields for threat detection).

**Fix** ([`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), `SharedVpcArgs.flowLogs.customFormat`):

**New Parameter**:
```typescript
/**
 * Custom flow log format (optional)
 * If not specified, uses security-enhanced default format with:
 * - Standard fields: srcaddr, dstaddr, srcport, dstport, protocol, bytes, packets
 * - Security fields: tcp-flags, pkt-srcaddr, pkt-dstaddr (for NAT detection)
 * - Metadata: vpc-id, subnet-id, instance-id, action, log-status
 */
customFormat?: string;
```

**Default Security-Enhanced Format** ([`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), OPERATIONS RESOURCES section, `defaultSecurityFormat`):
```typescript
const defaultSecurityFormat =
  "${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} " +
  "${packets} ${bytes} ${start} ${end} ${action} ${log-status} " +
  "${vpc-id} ${subnet-id} ${instance-id} ${tcp-flags} ${type} " +
  "${pkt-srcaddr} ${pkt-dstaddr}";
```

**Security Benefits**:
- ✅ **tcp-flags**: Detect SYN floods, port scans, connection hijacking
- ✅ **pkt-srcaddr/pkt-dstaddr**: Detect NAT traversal, source IP spoofing
- ✅ **instance-id**: Identify compromised EC2 instances
- ✅ **SIEM integration**: Format matches common SIEM tools (Splunk, Datadog, etc.)

**Threat Detection Examples**:
- **SYN flood**: `tcp-flags=SYN` + high packet count to single IP
- **Port scan**: Multiple `dstport` values from single `srcaddr` in short time
- **NAT traversal**: `pkt-srcaddr` ≠ `srcaddr` (unexpected NAT translation)
- **Compromised instance**: Unusual `instance-id` traffic patterns

---

## Configuration Examples

### Example 1: Dev Environment (Cost-Optimized)

```typescript
const vpc = new SharedVpc("dev-vpc", {
  environment: "dev",
  vpcCidr: "10.224.0.0/16",
  natGatewayCount: 0,           // Save cost ($32/mo per NAT): private tiers reach only
                                // VPC endpoints and IPv6-capable destinations
  enableIpv6: true,             // Dual-stack: a /64 on every subnet (default tiers' slots)
  // allowIpv6PublicIngress stays false (the default): non-prod takes no internet-initiated
  // inbound; required egress and its return traffic only
  flowLogs: {
    enabled: true,
    trafficType: "ALL",
    retentionDays: 30,          // Short retention for dev
    // Uses default security-enhanced format
  },
  vpcEndpoints: ["s3", "dynamodb"], // Free gateway endpoints only
});
```

### Example 2: Production Environment (High Security)

```typescript
const vpc = new SharedVpc("prd-vpc", {
  environment: "prd",
  vpcCidr: "10.226.0.0/16",
  natGatewayCount: 3,            // Full HA across 3 AZs
  enableIpv6: false,             // IPv4-only for simplicity
  flowLogs: {
    enabled: true,
    trafficType: "ALL",
    retentionDays: 365,          // 1-year retention for compliance
    // Uses default security-enhanced format for threat detection
  },
  vpcEndpoints: [
    "s3", "dynamodb",            // Free gateway endpoints
    "ecr.api", "ecr.dkr",        // ECR for container images
    "logs", "secretsmanager",    // Security services
  ],
});
```

### Example 3: HIPAA/Healthcare Environment (Max Security)

```typescript
const vpc = new SharedVpc("care-prd-vpc", {
  environment: "prd",
  vpcCidr: "10.240.0.0/16",
  natGatewayCount: 3,
  enableIpv6: true,              // Dual-stack; every custom tier below declares ipv6Slot
  allowIpv6PublicIngress: false, // The default; opt in only for a production-facing edge
  flowLogs: {
    enabled: true,
    trafficType: "ALL",
    retentionDays: 2555,         // 7-year retention (HIPAA requirement)
    customFormat:                // Custom format for healthcare SIEM
      "${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} " +
      "${action} ${tcp-flags} ${instance-id} ${interface-id}",
  },
  vpcEndpoints: [
    "s3", "dynamodb",
    "ecr.api", "ecr.dkr",
    "logs", "secretsmanager", "ssm",
    "kms",                       // Encryption key management
  ],
  subnetTiers: [
    { name: "public", routeToInternet: true, shareViaRam: false, ipv6Slot: 0 },
    { name: "app", routeToInternet: false, shareViaRam: true, ipv6Slot: 1 },
    { name: "hipaa-data", routeToInternet: false, shareViaRam: true, ipv6Slot: 2 },
    { name: "phi-isolated", routeToInternet: false, shareViaRam: true, cidrBits: 8, ipv6Slot: 3 },
  ],
});
```

---

## Testing Validation

### Test 1: Egress Validation

Covered by `packages/iac-aws/src/shared-vpc.unit.test.ts` under Pulumi mocks: no NAT and no IPv6
with private tiers throws; no NAT with IPv6 warns that IPv4-only destinations are unreachable.

### Test 2: IPv6 Dual-Stack and Public Ingress Control

Covered by `shared-vpc.unit.test.ts` (every subnet's /64 and assign-on-create; every tier's IPv6
NACL rules in both directions; `::/0` routes to the IGW and the egress-only gateway with and
without NAT; dual-stack endpoints; nothing IPv6 without `enableIpv6`; slot validation) and
`shared-vpc.ipv6-layout.unit.test.ts` (the /64 scheme; adding an AZ or a tier keeps every
existing /64).

### Test 3: Flow Log Format

```typescript
// Default security-enhanced format
const vpc1 = new SharedVpc("test-vpc", {
  flowLogs: { enabled: true, trafficType: "ALL" },
});
// Verify: flow logs include tcp-flags, pkt-srcaddr, pkt-dstaddr

// Custom SIEM format
const vpc2 = new SharedVpc("test-vpc", {
  flowLogs: {
    enabled: true,
    trafficType: "ALL",
    customFormat: "${srcaddr} ${dstaddr} ${action}",
  },
});
// Verify: flow logs use custom format
```

---

## Migration Guide

### Upgrading from 0.3.x to 0.4.0 (IPv6 dual-stack)

**Breaking for `enableIpv6: true` with custom `subnetTiers`**: every tier must declare a unique
`ipv6Slot` (0–15), or construction fails. Pick the slots once and never change them. The default
tiers carry slots 0/1/2. Without `enableIpv6`, nothing changes.

**Expected preview of a live `enableIpv6: true` VPC** (all in place; subnets must show
**update**, never replace):
- every subnet: update (`ipv6CidrBlock`, `assignIpv6AddressOnCreation`)
- every tier NACL: create the IPv6 rules (1095/1100…1150)
- with NAT gateways: create the egress-only gateway and a `::/0` route per private route table
- if `allowIpv6PublicIngress: false` was set: create the public `::/0 → IGW` route
- VPC endpoint security group: update (IPv6 ingress); endpoints: update `ipAddressType` where the
  service supports IPv6

**Behavior change**: `allowIpv6PublicIngress` now defaults to `false` (no internet-initiated
IPv6 inbound) and, when opted into for a production-facing edge, only adds IPv6 443/80 NACL rules;
the public `::/0 → IGW` route is always present with IPv6 (it is egress).

### Upgrading from 0.2.0 to 0.3.0

**Breaking Changes**: None (all new features are optional with backward-compatible defaults)

**New Features**:
1. **Egress validation**: Automatically validates NAT=0 requires IPv6 (prevents silent failures)
2. **IPv6 public ingress control**: New `allowIpv6PublicIngress` flag (defaults to `true`)
3. **Flow log security format**: New `customFormat` parameter (defaults to security-enhanced format)

**Action Required**:
- ✅ **None** - all changes are backward compatible
- ⚠️ **Recommended**: Review flow logs in SIEM to take advantage of new security fields (tcp-flags, pkt-srcaddr, etc.)

**Optional Upgrades**:
```typescript
// Before (0.2.0)
flowLogs: { enabled: true, trafficType: "ALL" }

// After (0.3.0) - same behavior, but now includes security fields
flowLogs: { enabled: true, trafficType: "ALL" }
// New fields automatically logged: tcp-flags, pkt-srcaddr, pkt-dstaddr
```

**Compliance Upgrades**:
```typescript
// HIPAA/healthcare environments should add:
allowIpv6PublicIngress: false,  // Block IPv6 public access
flowLogs: {
  retentionDays: 2555,          // 7-year retention
  customFormat: "...",          // Custom SIEM format
}
```

---

## Medium-Severity Issues Fixed

### 7. Route Table Tagging for RAM-Shared Subnets ✅

**Issue**: Route tables for shared subnets didn't have `ShareViaRam` tag, making cross-account audit harder.

**Fix** ([`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), ROUTING RESOURCES section, private route table tags):

```typescript
// Private route table with ShareViaRam tag
const privateRt = new aws.ec2.RouteTable({
  tags: {
    ...args.tags,
    Tier: tier.name,
    Type: "private",
    ShareViaRam: tier.shareViaRam.toString(), // ← Audit visibility
  },
});
```

**Benefits**:
- ✅ **Audit visibility**: Easily identify which route tables serve shared subnets
- ✅ **Compliance**: Tag-based reporting for cross-account resource sharing
- ✅ **Operational**: Filter route tables by `ShareViaRam=true` in AWS Console

**Query Example**:
```bash
# Find all route tables for RAM-shared subnets
aws ec2 describe-route-tables \
  --filters "Name=tag:ShareViaRam,Values=true" \
  --query 'RouteTables[*].[RouteTableId,Tags[?Key==`Tier`].Value|[0]]'
```

---

### 8. NAT Gateway High Availability Warning ✅

**Issue**: If `natGatewayCount=1` with 6 AZs, all 6 subnets share 1 NAT gateway (single point of failure). No warning issued.

**Fix** ([`packages/iac-aws/src/shared-vpc.ts`](../packages/iac-aws/src/shared-vpc.ts), HIGH AVAILABILITY VALIDATION section):

```typescript
// Warn if NAT Gateway count < AZ count (not HA)
if (natGatewayCount > 0 && natGatewayCount < args.availabilityZones.length) {
  void pulumi.log.warn(
    `NAT Gateway HA concern: NAT count (${natGatewayCount}) < AZ count (${args.availabilityZones.length}). ` +
    `Private subnets across multiple AZs share fewer NAT Gateways, creating potential single points of failure. ` +
    `For full HA, set natGatewayCount >= ${args.availabilityZones.length} (one NAT per AZ). ` +
    `Current distribution: Each NAT Gateway serves ${Math.ceil(args.availabilityZones.length / natGatewayCount)} AZs.`
  );
}
```

**Benefits**:
- ✅ **Operational awareness**: Clear warning during `pulumi preview`
- ✅ **Cost/HA tradeoff visibility**: Developers understand the risk
- ✅ **Actionable**: Suggests exact fix (natGatewayCount >= AZ count)

**Example Output**:
```
warning: NAT Gateway HA concern: NAT count (2) < AZ count (6).
Private subnets across multiple AZs share fewer NAT Gateways, creating potential single points of failure.
For full HA, set natGatewayCount >= 6 (one NAT per AZ).
Current distribution: Each NAT Gateway serves 3 AZs.
```

**NAT Gateway Distribution Logic**:
```typescript
// Each private subnet assigned to NAT Gateway using modulo
const natIndex = Math.min(i, natGateways.length - 1);
const natGw = natGateways[natIndex];
// Example: 6 AZs, 2 NAT Gateways
// AZ 0,1,2 → NAT 0
// AZ 3,4,5 → NAT 1
```

**Cost vs HA Guidance**:
- **Dev**: `natGatewayCount=0` (IPv6-only, FREE)
- **Staging**: `natGatewayCount=2` (cost savings, acceptable downtime)
- **Production**: `natGatewayCount >= AZ count` (full HA, ~$96/mo for 3 AZs)

---

### 9. IPv6-Only Egress (No DNS64/NAT64)

**Issue**: with `natGatewayCount=0` and `enableIpv6=true`, private tiers egress over IPv6 only
(egress-only internet gateway). IPv6 egress reaches only destinations that publish IPv6 (AAAA)
addresses. It cannot reach IPv4-only destinations — for example `github.com`, `api.github.com` and
`ghcr.io` publish no AAAA records (checked 2026-10-09) — and an IPv4-only workload cannot use IPv6
egress at all.

There is no DNS64/NAT64: NAT64 is a NAT gateway feature, so with no NAT gateway DNS64 would only
synthesize addresses that route nowhere.

**The rule**: `natGatewayCount=0` with private tiers is valid only when private-tier workloads
reach the internet solely through VPC endpoints or IPv6-capable destinations. Otherwise set
`natGatewayCount>0`. The component warns:

```
Private tiers have IPv6-only egress (egress-only internet gateway, no NAT gateway). They cannot
reach IPv4-only destinations, e.g. github.com, api.github.com and ghcr.io, and there is no
DNS64/NAT64 (NAT64 is a NAT gateway feature). This configuration is valid only when private-tier
workloads reach the internet solely through VPC endpoints or IPv6-capable destinations. Otherwise
set natGatewayCount>0.
```

Check a destination before relying on IPv6-only egress: `dig +short AAAA <host>` must return an
address for every host the workload contacts (including redirects, auth and blob/CDN hosts).

---

## Summary of All Fixes

### Critical Issues (3)
1. ✅ VPC Endpoints Not Implemented
2. ✅ No Network ACLs (NACLs)
3. ✅ No VPC Endpoint Security Group

### High-Severity Issues (3)
4. ✅ Private-Tier Egress Validation (NAT=0 without IPv6 fails)
5. ✅ IPv6 Dual-Stack and Public Ingress Control
6. ✅ No Flow Log Format Customization

### Medium-Severity Issues (3)
7. ✅ No Route Table Tagging for RAM-Shared Subnets
8. ✅ NAT Gateway High Availability Warning
9. ✅ IPv6-Only Egress Limits Stated (no DNS64/NAT64; validation + warning)

**Total**: 9 security issues fixed ✅

---

## Validation Checklist

Before deploying to production, validate:

- [ ] Run `pulumi preview` and review all warnings (NAT HA, IPv6-only, etc.)
- [ ] Verify route tables have `ShareViaRam` tag for audit trail
- [ ] Check NAT Gateway distribution matches HA requirements
- [ ] Confirm IPv6-only workloads can reach all required services
- [ ] Review flow logs in SIEM for new security fields (tcp-flags, etc.)
- [ ] Test VPC endpoints connectivity from private subnets
- [ ] Verify NACLs allow expected traffic (HTTP/HTTPS for public, VPC for private)
- [ ] Run AWS Trusted Advisor security checks
- [ ] Document any IPv6 public ingress decisions for compliance
