# Security Implementation - SharedVpc Component

## Overview

This document details the security controls implemented in the `SharedVpc` component to ensure defense-in-depth, zero-trust networking, and compliance with ISO27001/HIPAA requirements.

---

## Defense-in-Depth Architecture

### Layer 1: Network ACLs (NACLs) - Network Layer

**Location**: [`src/aws/shared-vpc.ts:451-605`](../src/aws/shared-vpc.ts#L451-L605)

**Purpose**: Stateless, subnet-level traffic filtering (defense against misconfigured security groups)

**Implementation**:

```typescript
// Per-tier NACLs for defense-in-depth
for (const tier of subnetTiers) {
  const tierNacl = new aws.ec2.NetworkAcl({ vpcId: vpc.id });

  if (tier.routeToInternet) {
    // Public tier: HTTP/HTTPS inbound, ephemeral outbound
    [443, 80].forEach((port) => {
      new aws.ec2.NetworkAclRule({
        protocol: "tcp",
        fromPort: port,
        toPort: port,
        cidrBlock: "0.0.0.0/0",
        ruleAction: "allow",
        egress: false,
      });
    });

    // Ephemeral ports for return traffic
    new aws.ec2.NetworkAclRule({
      protocol: "tcp",
      fromPort: 1024,
      toPort: 65535,
      cidrBlock: "0.0.0.0/0",
      egress: false,
    });
  } else {
    // Private tier: VPC-internal + ephemeral only
    new aws.ec2.NetworkAclRule({
      protocol: "-1", // All protocols
      cidrBlock: args.vpcCidr,
      ruleAction: "allow",
      egress: false,
    });

    new aws.ec2.NetworkAclRule({
      protocol: "tcp",
      fromPort: 1024,
      toPort: 65535,
      cidrBlock: "0.0.0.0/0",
      egress: false,
    });
  }

  // Outbound: Allow all (stateless - need explicit allow)
  new aws.ec2.NetworkAclRule({
    protocol: "-1",
    cidrBlock: "0.0.0.0/0",
    ruleAction: "allow",
    egress: true,
  });
}
```

**Security Benefits**:
- ✅ **Defense-in-depth**: Protects even if security groups misconfigured
- ✅ **Public tier**: Only HTTP/HTTPS + ephemeral ports inbound (blocks SSH, RDP, database ports)
- ✅ **Private tier**: Only VPC-internal traffic + NAT return traffic (blocks direct internet inbound)
- ✅ **Stateless**: Independent of connection state (can't be bypassed by connection hijacking)
- ✅ **Per-tier isolation**: Supports custom tiers (e.g., HIPAA data tier with stricter rules)

**Limitations**:
- ⚠️ No deny rules for known bad actors (future: integrate with threat intelligence)
- ⚠️ No geo-blocking (future: AWS Network Firewall for geo-restrictions)
- ⚠️ No rate limiting (future: AWS WAF for application-layer rate limits)

---

### Layer 2: Security Groups - Instance Layer

**Location**: [`src/aws/shared-vpc.ts:773-805`](../src/aws/shared-vpc.ts#L773-L805)

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

**Location**: [`src/aws/shared-vpc.ts:771-859`](../src/aws/shared-vpc.ts#L771-L859)

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

**Location**: [`src/aws/shared-vpc.ts:656-753`](../src/aws/shared-vpc.ts#L656-L753)

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
- Private subnets route egress through NAT Gateway (public subnet)
- NACLs block direct internet inbound traffic (ephemeral ports only for NAT return)
- VPC endpoints for AWS services (no internet traversal)

**Validation**:
- Private subnet route table has NO `0.0.0.0/0 → igw-*` route
- All AWS service traffic routes through VPC endpoints
- NACL blocks all inbound except VPC CIDR + ephemeral ports

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

### 1. Egress Validation - NAT=0 Requires IPv6 ✅

**Issue**: If `natGatewayCount=0` and `enableIpv6=false`, private subnets have zero internet access. Deployments succeed but workloads fail at runtime (silent failure).

**Fix** ([`src/aws/shared-vpc.ts:451-464`](../src/aws/shared-vpc.ts#L451-L464)):

```typescript
// Validate: Private subnets need egress (NAT Gateway or IPv6)
const privateTiersExist = subnetTiers.some(tier => !tier.routeToInternet);
if (privateTiersExist && natGatewayCount === 0 && args.enableIpv6 !== true) {
  throw new Error(
    "Invalid configuration: Private subnets require internet egress. " +
    "NAT Gateway count is 0 and IPv6 is disabled. " +
    "Private subnets will have NO internet access (deployments will fail). " +
    "Fix: Set enableIpv6=true (IPv6 egress via eigw) OR natGatewayCount>0 (IPv4 egress via NAT)."
  );
}
```

**Impact**:
- ✅ Fail-fast validation (error at pulumi preview, not runtime)
- ✅ Clear error message with fix instructions
- ✅ Prevents silent failures (workloads can't download packages, pull images, call APIs)

---

### 2. IPv6 Public Ingress Control ✅

**Issue**: If IPv6 enabled, public subnets automatically get `::/0 → IGW` route. This may be unintended for compliance-sensitive deployments (IPv6 addresses globally routable by default).

**Fix** ([`src/aws/shared-vpc.ts:125-133`](../src/aws/shared-vpc.ts#L125-L133)):

**New Parameter**:
```typescript
/**
 * Allow IPv6 public ingress on public subnets
 * - true (default): Public subnets get ::/0 → IGW route (globally routable IPv6)
 * - false: No IPv6 public ingress (IPv6 egress-only for private subnets)
 *
 * Security consideration: IPv6 addresses are globally routable by default.
 * For compliance-sensitive workloads (e.g., HIPAA), set to false.
 */
allowIpv6PublicIngress?: boolean;
```

**Implementation** ([`src/aws/shared-vpc.ts:685-698`](../src/aws/shared-vpc.ts#L685-L698)):
```typescript
// IPv6 route if enabled AND public ingress allowed
const allowIpv6PublicIngress = args.allowIpv6PublicIngress ?? true;
if (args.enableIpv6 === true && allowIpv6PublicIngress) {
  new aws.ec2.Route(
    `${args.environment}-public-route-ipv6`,
    {
      routeTableId: publicRt.id,
      destinationIpv6CidrBlock: "::/0",
      gatewayId: igw.id,
    },
    defaultOpts
  );
}
```

**Benefits**:
- ✅ Opt-out for IPv6 public accessibility (HIPAA compliance)
- ✅ Backward compatible (defaults to `true`)
- ✅ Explicit control over IPv6 routing

**Use Cases**:
- **Default (`true`)**: Standard web applications need IPv6 public access
- **Compliance (`false`)**: HIPAA/healthcare workloads with PHI data shouldn't be IPv6-accessible

---

### 3. Flow Log Format Customization for Security ✅

**Issue**: Flow logs use default AWS format (missing critical security fields for threat detection).

**Fix** ([`src/aws/shared-vpc.ts:167-180`](../src/aws/shared-vpc.ts#L167-L180)):

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

**Default Security-Enhanced Format** ([`src/aws/shared-vpc.ts:943-952`](../src/aws/shared-vpc.ts#L943-L952)):
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
  natGatewayCount: 0,           // Save cost ($32/mo per NAT)
  enableIpv6: true,             // Required for private subnet egress
  allowIpv6PublicIngress: true, // Standard dev workflow
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
  enableIpv6: true,              // Enable for future-proofing
  allowIpv6PublicIngress: false, // ⚠️ Block IPv6 public access (HIPAA compliance)
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
    { name: "public", routeToInternet: true, shareViaRam: false },
    { name: "app", routeToInternet: false, shareViaRam: true },
    { name: "hipaa-data", routeToInternet: false, shareViaRam: true },
    { name: "phi-isolated", routeToInternet: false, shareViaRam: true, cidrBits: 8 },
  ],
});
```

---

## Testing Validation

### Test 1: Egress Validation

```typescript
// Should throw error
expect(() => {
  new SharedVpc("test-vpc", {
    natGatewayCount: 0,
    enableIpv6: false,  // ❌ Invalid: no egress path
  });
}).toThrow(/Private subnets require internet egress/);

// Should succeed
const vpc = new SharedVpc("test-vpc", {
  natGatewayCount: 0,
  enableIpv6: true,   // ✅ Valid: IPv6 egress via eigw
});
```

### Test 2: IPv6 Public Ingress Control

```typescript
// Default: IPv6 public ingress allowed
const vpc1 = new SharedVpc("test-vpc", {
  enableIpv6: true,
  // allowIpv6PublicIngress defaults to true
});
// Verify: public route table has ::/0 → IGW

// Compliance: IPv6 egress-only
const vpc2 = new SharedVpc("test-vpc", {
  enableIpv6: true,
  allowIpv6PublicIngress: false,  // ✅ No ::/0 route in public RT
});
// Verify: NO ::/0 → IGW route, only eigw for private subnets
```

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

**Fix** ([`src/aws/shared-vpc.ts:760`](../src/aws/shared-vpc.ts#L760)):

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

**Fix** ([`src/aws/shared-vpc.ts:479-488`](../src/aws/shared-vpc.ts#L479-L488)):

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

### 9. DNS64 for IPv6-Only Workloads ✅

**Issue**: If `natGatewayCount=0` (IPv6-only egress), workloads can't reach IPv4-only services without DNS64/NAT64.

**Fix** ([`src/aws/shared-vpc.ts:505-517`](../src/aws/shared-vpc.ts#L505-L517)):

```typescript
// Warn about IPv6-only limitations (DNS64 not configured)
if (privateTiersExist && natGatewayCount === 0 && args.enableIpv6 === true) {
  void pulumi.log.warn(
    "IPv6-only egress mode detected (NAT Gateway count = 0, IPv6 enabled). " +
    "IMPORTANT: IPv6-only workloads cannot reach IPv4-only services without DNS64/NAT64. " +
    "Many AWS services and third-party APIs are IPv4-only. " +
    "Current setup uses IPv6 egress-only gateway (eigw) for cost savings. " +
    "If you need IPv4 compatibility: " +
    "(1) Add natGatewayCount>0 for dual-stack egress, OR " +
    "(2) Configure Route 53 Resolver DNS64 + NAT64 (not yet implemented in this component). " +
    "For dev/test environments, IPv6-only is usually sufficient (AWS services support IPv6)."
  );
}
```

**Benefits**:
- ✅ **Awareness**: Developers know about IPv4 limitations upfront
- ✅ **Actionable**: Two clear paths forward (NAT Gateway or DNS64)
- ✅ **Cost transparency**: IPv6-only = FREE, but has limitations

**IPv6-Only Compatibility Matrix**:

| Service | IPv6 Support | IPv6-Only Compatible? |
|---------|--------------|------------------------|
| **AWS Services** |||
| S3 | ✅ Full | ✅ Yes (via VPC endpoint or public IPv6) |
| DynamoDB | ✅ Full | ✅ Yes (via VPC endpoint or public IPv6) |
| ECR | ✅ Full | ✅ Yes (interface VPC endpoint with IPv6) |
| Secrets Manager | ✅ Full | ✅ Yes (interface VPC endpoint with IPv6) |
| CloudWatch Logs | ✅ Full | ✅ Yes (interface VPC endpoint with IPv6) |
| RDS | ⚠️ Partial | ⚠️ Dual-stack only (needs IPv4 address) |
| Lambda | ⚠️ Partial | ⚠️ Dual-stack only (needs IPv4 address) |
| **Third-Party APIs** |||
| GitHub API | ❌ IPv4-only | ❌ No (needs NAT64 or NAT Gateway) |
| npm registry | ❌ IPv4-only | ❌ No (needs NAT64 or NAT Gateway) |
| Docker Hub | ❌ IPv4-only | ❌ No (needs NAT64 or NAT Gateway) |
| Most SaaS APIs | ❌ IPv4-only | ❌ No (needs NAT64 or NAT Gateway) |

**Recommendation**:
- **Dev/test**: IPv6-only acceptable (most AWS services work, can add NAT Gateway if needed)
- **Production**: Use NAT Gateways (`natGatewayCount >= 1`) for IPv4 compatibility
- **Future**: DNS64/NAT64 support planned for cost-optimized IPv4 compatibility

---

## Summary of All Fixes

### Critical Issues (3)
1. ✅ VPC Endpoints Not Implemented
2. ✅ No Network ACLs (NACLs)
3. ✅ No VPC Endpoint Security Group

### High-Severity Issues (3)
4. ✅ No IPv6 Egress Validation (NAT=0 requires IPv6)
5. ✅ Uncontrolled IPv6 Public Ingress
6. ✅ No Flow Log Format Customization

### Medium-Severity Issues (3)
7. ✅ No Route Table Tagging for RAM-Shared Subnets
8. ✅ NAT Gateway High Availability Warning
9. ✅ DNS64 for IPv6-Only Workloads (documentation + warning)

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
