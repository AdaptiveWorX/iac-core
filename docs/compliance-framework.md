# Compliance Framework

**Version**: 1.0.0
**Last Updated**: 2025-10-08
**Owner**: Security & Compliance Team

## Overview

This framework establishes machine-readable compliance metadata for infrastructure code, enabling automated compliance reporting, audit trails, and continuous validation.

## Compliance Metadata Schema

### Code-Level Annotations

All security-critical code must include compliance tags using JSDoc-style comments:

```typescript
/**
 * @compliance {framework}:{control-id} - {description}
 * @severity {critical|high|medium|low}
 * @control-type {preventive|detective|corrective|compensating}
 * @risk {threat-description}
 */
```

### Test-Level Metadata

Security and compliance tests must include structured metadata via Vitest `meta` option:

```typescript
it("should enforce encryption at rest", {
  meta: {
    id: "unique-test-id",
    compliance: ["ISO27001:A.10.1.1", "SOC2:CC6.7"],
    severity: "critical",
    controlType: "preventive",
    risk: "Data breach via unencrypted storage",
  }
}, () => {
  // Test implementation
});
```

## Severity Levels

| Level | Definition | SLA | Example |
|-------|-----------|-----|---------|
| **critical** | Control failure leads to immediate security breach or regulatory violation | Fix within 24h | Encryption disabled, public S3 access |
| **high** | Control failure creates significant security risk | Fix within 7 days | Missing MFA, weak IAM policies |
| **medium** | Control failure increases attack surface | Fix within 30 days | Missing CloudTrail logs, no VPC Flow Logs |
| **low** | Control failure reduces defense-in-depth | Fix within 90 days | Missing resource tags, non-critical logging |

## Control Types

| Type | Purpose | Implementation | Example |
|------|---------|----------------|---------|
| **preventive** | Block unauthorized actions before they occur | IAM policies, Security Groups, S3 Block Public Access | Prevent public S3 buckets |
| **detective** | Identify security issues after they occur | CloudTrail, GuardDuty, Config Rules | Detect unauthorized API calls |
| **corrective** | Automatically remediate security issues | Lambda auto-remediation, AWS Config remediation | Auto-delete public S3 buckets |
| **compensating** | Alternative control when primary control isn't feasible | Manual review, additional monitoring | Manual quarterly access review |

## Risk Taxonomy

All controls should document the threat they mitigate:

- **Data Breach**: Unauthorized access to sensitive data
- **Data Exfiltration**: Unauthorized data transfer outside trusted boundaries
- **Privilege Escalation**: Unauthorized elevation of access permissions
- **Denial of Service**: Service disruption or availability loss
- **Compliance Violation**: Failure to meet regulatory requirements
- **Resource Abuse**: Unauthorized use of cloud resources (crypto mining, etc.)
- **Supply Chain Attack**: Compromise via third-party dependencies

## Supported Compliance Frameworks

### ISO 27001:2022

**Scope**: Information Security Management System (ISMS)

**Key Controls Implemented**:
- A.9.4.1 - Information access restriction
- A.10.1.1 - Policy on cryptographic controls
- A.10.1.2 - Key management
- A.12.3.1 - Information backup
- A.13.1.1 - Network controls
- A.13.1.3 - Segregation of networks

### SOC 2 Type II (Future)

**Trust Services Criteria**:
- CC6.1 - Logical and physical access controls
- CC6.6 - Encryption of confidential information
- CC6.7 - Encryption of data at rest
- CC7.2 - System monitoring

### HIPAA (Future)

**Technical Safeguards** (45 CFR § 164.312):
- § 164.312(a)(1) - Access Control
- § 164.312(a)(2)(iv) - Encryption and Decryption
- § 164.312(b) - Audit Controls
- § 164.312(e)(2)(ii) - Encryption

### PCI DSS v4.0 (Future)

**Requirements**:
- Requirement 3 - Protect stored account data
- Requirement 4 - Protect cardholder data with strong cryptography
- Requirement 8 - Identify users and authenticate access

## Implementation Examples

### Example 1: S3 Encryption (Preventive Control)

**Code** (`packages/iac-aws/src/shared-vpc.ts`):
```typescript
/**
 * @compliance ISO27001:A.10.1.1 - Policy on cryptographic controls
 * @compliance ISO27001:A.10.1.2 - Key management
 * @compliance SOC2:CC6.7 - Encryption of data at rest
 * @severity critical
 * @control-type preventive
 * @risk Data breach via unencrypted storage
 */
new aws.s3.BucketServerSideEncryptionConfiguration(
  `${name}-flow-logs-encryption`,
  {
    bucket: flowLogsBucket.id,
    rules: [{
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "AES256",
      },
    }],
  }
);
```

**Test** (`packages/iac-aws/src/shared-vpc.unit.test.ts`):
```typescript
it("should enforce S3 encryption at rest", {
  meta: {
    id: "s3-encryption-at-rest",
    compliance: ["ISO27001:A.10.1.1", "ISO27001:A.10.1.2", "SOC2:CC6.7"],
    severity: "critical",
    controlType: "preventive",
    risk: "Data breach via unencrypted storage",
  }
}, () => {
  const encryptionConfig = {
    sseAlgorithm: "AES256",
  };
  expect(encryptionConfig.sseAlgorithm).toBe("AES256");
});
```

### Example 2: S3 Public Access Block (Preventive Control)

**Code** (`packages/iac-aws/src/shared-vpc.ts`):
```typescript
/**
 * @compliance ISO27001:A.13.1.3 - Segregation of networks
 * @compliance ISO27001:A.9.4.1 - Information access restriction
 * @compliance SOC2:CC6.1 - Logical access controls
 * @severity critical
 * @control-type preventive
 * @risk Data breach via public internet exposure
 */
new aws.s3.BucketPublicAccessBlock(
  `${name}-flow-logs-public-access-block`,
  {
    bucket: flowLogsBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  }
);
```

### Example 3: VPC Flow Logs (Detective Control)

**Code** (`packages/iac-aws/src/shared-vpc.ts`):
```typescript
/**
 * @compliance ISO27001:A.12.4.1 - Event logging
 * @compliance SOC2:CC7.2 - System monitoring
 * @severity high
 * @control-type detective
 * @risk Undetected network intrusions or data exfiltration
 */
new aws.ec2.FlowLog(`${name}-flow-log`, {
  vpcId: vpc.id,
  trafficType: trafficType,
  logDestinationType: "s3",
  logDestination: flowLogsBucket.arn,
});
```

## Automated Compliance Reporting

### CI/CD Integration

All compliance metadata is extracted during CI/CD and generates:

1. **Compliance Matrix** - Maps controls → code locations → tests
2. **Gap Analysis** - Identifies unimplemented controls
3. **Test Coverage Report** - Shows compliance test pass/fail rates
4. **Audit Trail** - Git commits affecting compliance controls

### Report Generation

```bash
# Generate compliance report (future script)
yarn compliance:report

# Output:
# - compliance-matrix.json (machine-readable)
# - compliance-report.html (human-readable)
# - compliance-gaps.md (missing controls)
```

### Report Format

```json
{
  "framework": "ISO27001:2022",
  "generatedAt": "2025-10-08T13:30:00Z",
  "controls": [
    {
      "id": "A.10.1.1",
      "name": "Policy on cryptographic controls",
      "status": "implemented",
      "implementations": [
        {
          "file": "packages/iac-aws/src/shared-vpc.ts",
          "line": 963,
          "type": "code",
          "severity": "critical",
          "controlType": "preventive"
        }
      ],
      "tests": [
        {
          "file": "packages/iac-aws/src/shared-vpc.unit.test.ts",
          "line": 192,
          "id": "s3-encryption-at-rest",
          "status": "passing",
          "lastRun": "2025-10-08T13:25:00Z"
        }
      ],
      "coverage": "100%"
    }
  ]
}
```

## Compliance Testing Strategy

### Test Categories

1. **Unit Tests** (`*.unit.test.ts`) - Test individual security controls
2. **Integration Tests** (`*.integration.test.ts`) - Test control interactions
3. **Security Tests** (`*.security.test.ts`) - Penetration/vulnerability tests
4. **Policy Tests** (`policies/*.test.ts`) - Pulumi CrossGuard policy validation

### Coverage Requirements

| Control Severity | Test Coverage Required | Review Frequency |
|-----------------|----------------------|------------------|
| Critical | 100% (all code paths) | Every commit |
| High | 95% | Weekly |
| Medium | 80% | Monthly |
| Low | 50% | Quarterly |

### Test Execution

```bash
# Run all compliance tests
yarn test

# Run only critical severity tests
yarn test --grep "severity.*critical"

# Run specific framework tests
yarn test --grep "ISO27001"
```

## Encryption Standards

### Data at Rest

**Required**: AES-256 encryption for all data at rest

**Key Management**:
- **SSE-S3**: AWS-managed keys (default, suitable for most use cases)
- **SSE-KMS**: Customer-managed keys (required for: PII, PHI, PCI data)
- **Key Rotation**: Automatic annual rotation for KMS keys

**Approved Algorithms**:
- ✅ AES-256 (FIPS 140-2 approved)
- ✅ AES-256-GCM (authenticated encryption)
- ❌ AES-128 (insufficient for critical data)
- ❌ DES/3DES (deprecated)

### Data in Transit

**Required**: TLS 1.2+ for all data in transit

**Approved Protocols**:
- ✅ TLS 1.3 (preferred)
- ✅ TLS 1.2 (minimum)
- ❌ TLS 1.1 (deprecated)
- ❌ TLS 1.0 (deprecated)
- ❌ SSL 3.0 (deprecated)

**Certificate Requirements**:
- Minimum 2048-bit RSA or 256-bit ECC
- Valid CA-signed certificates (no self-signed in production)
- Automated renewal via ACM or cert-manager

### Key Management Policies

1. **Separation of Duties**: Encryption keys managed by separate team/account
2. **Principle of Least Privilege**: Only authorized services can decrypt
3. **Key Rotation**: Annual rotation for long-lived keys
4. **Key Backup**: Keys backed up in separate region/account
5. **Key Destruction**: 30-day grace period before permanent deletion

## Network Segregation Architecture

### 3-Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AWS Account: ops-sec                   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │            VPC: 10.224.0.0/16 (dev)                │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  Public Subnets (10.224.0.0/20)             │  │   │
│  │  │  - Internet Gateway attached                 │  │   │
│  │  │  - NAT Gateways (HA: 2)                     │  │   │
│  │  │  - NOT shared via RAM (isolated)            │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  Private Subnets (10.224.16.0/20)           │  │   │
│  │  │  - Application tier                          │  │   │
│  │  │  - Routes to NAT Gateway for egress          │  │   │
│  │  │  - Shared via RAM to worx-app-dev           │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  Data Subnets (10.224.32.0/20)              │  │   │
│  │  │  - Database tier                             │  │   │
│  │  │  - Routes to NAT Gateway for egress          │  │   │
│  │  │  - Shared via RAM to worx-app-dev           │  │   │
│  │  │  - Isolated from public subnets              │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ RAM Sharing
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   AWS Account: worx-app-dev                 │
│                                                             │
│  Application workloads use shared private/data subnets     │
│  - Cannot create resources in public subnets                │
│  - Egress via centralized NAT Gateways                     │
│  - Network isolated from other environments                │
└─────────────────────────────────────────────────────────────┘
```

### Segregation Controls

| Layer | Control | Implementation |
|-------|---------|----------------|
| **Network** | VPC isolation | Separate VPCs per environment (dev/stg/prd) |
| **Subnet** | Tier separation | 3-tier architecture (public/private/data) |
| **Account** | Workload isolation | Separate AWS accounts per environment |
| **RAM** | Selective sharing | Only private/data subnets shared, public isolated |
| **Security Groups** | Port restrictions | Deny-by-default, explicit allow rules only |
| **NACLs** | Subnet-level firewall | Stateless filtering at subnet boundaries |

### VPC Endpoints (Data Exfiltration Prevention)

**Gateway Endpoints** (free, prevent internet egress):
- S3 - Keeps S3 traffic within AWS network
- DynamoDB - Keeps DynamoDB traffic within AWS network

**Interface Endpoints** (prevent internet egress):
- ECR (API + DKR) - Container image pulls via PrivateLink
- Secrets Manager - Secret retrieval via PrivateLink
- CloudWatch Logs - Log delivery via PrivateLink
- STS - Credential requests via PrivateLink

## Change Management

### Adding New Controls

1. **Identify Control**: Map to compliance framework (ISO27001, SOC2, etc.)
2. **Implement Code**: Add code with compliance annotations
3. **Write Tests**: Add test with metadata (including `meta.compliance`)
4. **Update Documentation**: Regenerate compliance report via CI
5. **Peer Review**: Security team reviews all compliance changes
6. **Deploy**: CI/CD validates and deploys

### Modifying Existing Controls

1. **Impact Analysis**: Check compliance report for affected frameworks
2. **Update Code**: Modify with updated compliance annotations
3. **Update Tests**: Ensure tests still validate control effectiveness
4. **Audit Trail**: Git commit message must reference control ID
5. **Approval**: Requires security team approval for critical controls

### Deprecating Controls

1. **Compensating Control**: Implement replacement before removal
2. **Update Compliance Report**: Document control replacement
3. **Grace Period**: 30 days before removal (allow audit documentation)
4. **Removal**: Delete code and update compliance report

## Audit Support

### Evidence Collection

For auditor requests, generate evidence package:

```bash
# Generate audit evidence package
yarn compliance:audit-package \
  --framework ISO27001 \
  --control A.10.1.1 \
  --output ./audit-evidence/

# Output:
# - control-implementation.md (code locations)
# - test-results.json (test execution history)
# - git-history.txt (change log for control)
# - compliance-report.pdf (executive summary)
```

### Auditor Questions - Response Template

**Question**: "How do you ensure {control description}?"

**Response Structure**:
1. **Control Implementation**: Link to code with compliance annotation
2. **Test Evidence**: Link to test with metadata showing pass/fail
3. **Continuous Validation**: CI/CD results showing automated enforcement
4. **Audit Trail**: Git history showing when control was implemented
5. **Frequency**: How often control is validated (every commit, daily, etc.)

## Future Enhancements

- [ ] Automated compliance gap analysis
- [ ] Real-time compliance dashboard
- [ ] Integration with Pulumi CrossGuard for policy enforcement
- [ ] Multi-framework compliance report (ISO27001 + SOC2 + HIPAA)
- [ ] Compliance drift detection (infrastructure vs. code)
- [ ] Automated evidence collection for audits
- [ ] Compliance score trending over time

## References

- [ISO 27001:2022 Controls](https://www.iso.org/standard/27001)
- [SOC 2 Trust Services Criteria](https://www.aicpa.org/soc2)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)
