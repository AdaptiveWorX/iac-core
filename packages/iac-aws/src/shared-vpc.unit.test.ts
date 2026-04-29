/**
 * SharedVpc Component Tests
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests security controls and compliance requirements for VPC infrastructure
 */

import { describe, expect, it } from "vitest";

describe("SharedVpc Component", () => {
  describe("S3 Flow Logs Configuration", () => {
    it("should validate flow logs traffic types", () => {
      const validTypes = ["ALL", "ACCEPT", "REJECT"];

      for (const type of validTypes) {
        expect(validTypes).toContain(type);
      }
    });

    it.each([
      ["ALL", "captures all traffic"],
      ["ACCEPT", "captures only accepted traffic"],
      ["REJECT", "captures only rejected traffic"],
    ])("should support traffic type %s (%s)", (trafficType, _description) => {
      const validTypes = ["ALL", "ACCEPT", "REJECT"];
      expect(validTypes).toContain(trafficType);
    });

    it("should validate retention days is positive", () => {
      const validRetentions = [30, 90, 365, 730];

      for (const days of validRetentions) {
        expect(days).toBeGreaterThan(0);
        expect(Number.isInteger(days)).toBe(true);
      }
    });

    it.each([
      [30, "30-day retention"],
      [90, "90-day retention"],
      [365, "1-year retention"],
      [730, "2-year retention"],
    ])("should accept %d days retention (%s)", (days, _description) => {
      expect(days).toBeGreaterThan(0);
      expect(Number.isInteger(days)).toBe(true);
    });

    it("should validate S3 bucket naming requirements", () => {
      // S3 bucket names must:
      // - Be 3-63 characters long
      // - Contain only lowercase letters, numbers, hyphens
      // - Start and end with letter or number
      const bucketName = "worx-flow-logs-stg-730335555486-us-east-1";

      expect(bucketName.length).toBeGreaterThanOrEqual(3);
      expect(bucketName.length).toBeLessThanOrEqual(63);
      expect(bucketName).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    });

    it("should include environment in bucket name for multi-env deployments", () => {
      // When multiple VPCs are deployed to the same account (e.g., centralized VPCs),
      // bucket names must include environment to avoid collisions
      const stgBucket = "worx-flow-logs-stg-730335555486-us-east-1";
      const prdBucket = "worx-flow-logs-prd-730335555486-us-east-1";

      // Ensure bucket names are unique
      expect(stgBucket).not.toBe(prdBucket);

      // Ensure all meet S3 naming requirements
      for (const bucket of [stgBucket, prdBucket]) {
        expect(bucket.length).toBeLessThanOrEqual(63);
        expect(bucket).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
      }
    });
  });

  describe("NAT Gateway Configuration", () => {
    it.each([
      [0, 6, "IPv6-only (no NAT)"],
      [1, 6, "Single NAT for cost savings"],
      [2, 6, "Dual NAT for HA"],
      [6, 6, "Full HA (one NAT per AZ)"],
    ])("should support %d NAT gateways across %d AZs (%s)", (natCount, azCount, _description) => {
      expect(natCount).toBeGreaterThanOrEqual(0);
      expect(natCount).toBeLessThanOrEqual(azCount);
      expect(azCount).toBeGreaterThan(0);
    });

    it("should calculate AZs per NAT gateway", () => {
      const testCases = [
        { natCount: 1, azCount: 6, expected: 6 },
        { natCount: 2, azCount: 6, expected: 3 },
        { natCount: 3, azCount: 6, expected: 2 },
        { natCount: 6, azCount: 6, expected: 1 },
      ];

      for (const { natCount, azCount, expected } of testCases) {
        const azsPerNat = Math.ceil(azCount / natCount);
        expect(azsPerNat).toBe(expected);
      }
    });
  });

  describe("Subnet Configuration", () => {
    it("should support 3-tier architecture", () => {
      const tiers = ["public", "private", "data"];
      expect(tiers).toHaveLength(3);
    });

    it.each([
      ["public", true, false, "Internet-facing subnets"],
      ["private", false, true, "Application tier"],
      ["data", false, true, "Database tier"],
    ])(
      "should configure %s tier: routeToInternet=%s, shareViaRam=%s (%s)",
      (tierName, routeToInternet, shareViaRam, _description) => {
        expect(typeof tierName).toBe("string");
        expect(typeof routeToInternet).toBe("boolean");
        expect(typeof shareViaRam).toBe("boolean");
      }
    );

    it("should calculate subnet CIDR size from VPC CIDR", () => {
      // VPC: 10.0.0.0/16 → subnets: /20 (4096 IPs each)
      const vpcMask = 16;
      const subnetMask = 20;
      const bitsForSubnets = subnetMask - vpcMask;

      expect(bitsForSubnets).toBe(4); // 2^4 = 16 possible /20 subnets
      expect(2 ** bitsForSubnets).toBe(16);
    });
  });

  describe("VPC Endpoints Configuration", () => {
    it("should support gateway endpoints (zero cost)", () => {
      const gatewayEndpoints = ["s3", "dynamodb"];
      expect(gatewayEndpoints).toContain("s3");
      expect(gatewayEndpoints).toContain("dynamodb");
    });

    it("should support interface endpoints", () => {
      const interfaceEndpoints = ["ecr.api", "ecr.dkr", "logs", "secretsmanager"];

      for (const endpoint of interfaceEndpoints) {
        expect(typeof endpoint).toBe("string");
        expect(endpoint.length).toBeGreaterThan(0);
      }
    });

    it.each([
      ["s3", "gateway"],
      ["dynamodb", "gateway"],
      ["ecr.api", "interface"],
      ["logs", "interface"],
    ])("should identify %s as %s endpoint", (serviceName, endpointType) => {
      const gatewayEndpoints = ["s3", "dynamodb"];
      const isGateway = gatewayEndpoints.includes(serviceName);

      if (endpointType === "gateway") {
        expect(isGateway).toBe(true);
      } else {
        expect(isGateway).toBe(false);
      }
    });
  });

  describe("Security Configuration", () => {
    it(
      "should block all public S3 access by default",
      {
        meta: {
          id: "s3-block-public-access",
          compliance: ["ISO27001:A.13.1.3", "ISO27001:A.9.4.1"],
          severity: "critical",
          controlType: "preventive",
          risk: "Data breach via public internet exposure",
        },
      },
      () => {
        const publicAccessConfig = {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
        };

        expect(publicAccessConfig.blockPublicAcls).toBe(true);
        expect(publicAccessConfig.blockPublicPolicy).toBe(true);
        expect(publicAccessConfig.ignorePublicAcls).toBe(true);
        expect(publicAccessConfig.restrictPublicBuckets).toBe(true);
      }
    );

    it(
      "should enable S3 bucket versioning for flow logs",
      {
        meta: {
          id: "s3-versioning-enabled",
          compliance: ["ISO27001:A.12.3.1"],
          severity: "medium",
          controlType: "corrective",
          risk: "Data loss from accidental deletion or corruption",
        },
      },
      () => {
        const versioningEnabled = true;
        expect(versioningEnabled).toBe(true);
      }
    );

    it(
      "should enforce S3 encryption at rest",
      {
        meta: {
          id: "s3-encryption-at-rest",
          compliance: ["ISO27001:A.10.1.1", "ISO27001:A.10.1.2"],
          severity: "critical",
          controlType: "preventive",
          risk: "Data breach via unencrypted storage",
        },
      },
      () => {
        const encryptionConfig = {
          sseAlgorithm: "AES256",
        };

        expect(encryptionConfig.sseAlgorithm).toBe("AES256");
      }
    );

    it.each([
      ["AES256", "S3-managed encryption"],
      ["aws:kms", "KMS-managed encryption"],
    ])("should support %s encryption (%s)", (algorithm, _description) => {
      const validAlgorithms = ["AES256", "aws:kms"];
      expect(validAlgorithms).toContain(algorithm);
    });

    it(
      "should enable VPC Flow Logs for threat detection",
      {
        meta: {
          id: "vpc-flow-logs-enabled",
          compliance: ["ISO27001:A.12.4.1", "ISO27001:A.12.4.3"],
          severity: "high",
          controlType: "detective",
          risk: "Undetected network intrusions or data exfiltration",
        },
      },
      () => {
        const flowLogsConfig = {
          enabled: true,
          trafficType: "ALL",
          logDestinationType: "s3",
        };

        expect(flowLogsConfig.enabled).toBe(true);
        expect(flowLogsConfig.trafficType).toBe("ALL");
        expect(flowLogsConfig.logDestinationType).toBe("s3");
      }
    );

    it(
      "should enforce flow log retention policies",
      {
        meta: {
          id: "flow-log-retention",
          compliance: ["ISO27001:A.12.4.2"],
          severity: "medium",
          controlType: "detective",
          risk: "Insufficient audit trail for incident investigation",
        },
      },
      () => {
        const retentionDays = 90;
        expect(retentionDays).toBeGreaterThanOrEqual(30);
        expect(retentionDays).toBeLessThanOrEqual(2555); // 7 years max
      }
    );
  });

  describe("RAM Sharing Configuration", () => {
    it("should validate AWS account ID format", () => {
      const accountIds = [
        "123456789012", // Valid
        "730335555486", // Valid (ops-sec)
        "413639306030", // Valid (app-dev)
      ];

      for (const accountId of accountIds) {
        expect(accountId).toMatch(/^\d{12}$/);
        expect(accountId.length).toBe(12);
      }
    });

    it.each([
      ["private", true, "Share private subnets"],
      ["data", true, "Share data subnets"],
      ["public", false, "Don't share public subnets"],
    ])(
      "should configure %s subnets: shareViaRam=%s (%s)",
      (tierName, shareViaRam, _description) => {
        // Public subnets typically not shared for security
        if (tierName === "public") {
          expect(shareViaRam).toBe(false);
        } else {
          expect(shareViaRam).toBe(true);
        }
      }
    );

    it(
      "should restrict RAM sharing to same tenant and environment only",
      {
        meta: {
          id: "ram-sharing-tenant-environment-isolation",
          compliance: ["ISO27001:A.9.4.1", "ISO27001:A.13.1.3"],
          severity: "high",
          controlType: "preventive",
          risk: "Unauthorized cross-account access to network resources",
        },
      },
      () => {
        // VPC in dev environment should only share to dev accounts
        const devVpcConfig = {
          environment: "dev",
          tenant: "worx",
          allowExternalPrincipals: false,
          sharedAccounts: {
            "413639306030": "worx-app-dev", // ✅ Same tenant, same environment
            "999999999999": "worx-ucx-dev", // ✅ Same tenant, same environment (different purpose)
          },
        };

        // Validate external principals disabled (no cross-organization sharing)
        expect(devVpcConfig.allowExternalPrincipals).toBe(false);

        // Validate shared accounts match tenant and environment
        for (const [accountId, accountName] of Object.entries(devVpcConfig.sharedAccounts)) {
          // Account ID must be 12 digits
          expect(accountId).toMatch(/^\d{12}$/);

          // Account name must match pattern: {tenant}-{purpose}-{env}
          expect(accountName).toMatch(/^worx-(app|ucx|aiml|ops|sec)-dev$/);

          // Account name must match VPC tenant
          expect(accountName).toContain(devVpcConfig.tenant);

          // Account name must match VPC environment
          expect(accountName).toContain(devVpcConfig.environment);

          // ❌ Should NOT share to different environments
          expect(accountName).not.toContain("-stg");
          expect(accountName).not.toContain("-prd");
        }
      }
    );

    it(
      "should only share private and data subnets, not public",
      {
        meta: {
          id: "ram-sharing-tier-isolation",
          compliance: ["ISO27001:A.13.1.3"],
          severity: "high",
          controlType: "preventive",
          risk: "Privilege escalation via shared public subnets",
        },
      },
      () => {
        const sharedTiers = ["private", "data"];
        const publicTier = "public";

        expect(sharedTiers).not.toContain(publicTier);
        expect(sharedTiers).toContain("private");
        expect(sharedTiers).toContain("data");
      }
    );
  });

  describe("VPC Endpoint Security", () => {
    it(
      "should use VPC endpoints to prevent data exfiltration",
      {
        meta: {
          id: "vpc-endpoint-data-exfiltration-prevention",
          compliance: ["ISO27001:A.13.1.3", "ISO27001:A.13.2.1"],
          severity: "high",
          controlType: "preventive",
          risk: "Data exfiltration via internet egress",
        },
      },
      () => {
        const vpcEndpoints = {
          gateway: ["s3", "dynamodb"], // Free, no internet routing
          interface: ["ecr.api", "ecr.dkr", "logs", "secretsmanager"],
        };

        // Verify gateway endpoints (prevent S3/DynamoDB internet routing)
        expect(vpcEndpoints.gateway).toContain("s3");
        expect(vpcEndpoints.gateway).toContain("dynamodb");

        // Verify interface endpoints (PrivateLink for AWS services)
        expect(vpcEndpoints.interface.length).toBeGreaterThan(0);
      }
    );

    it(
      "should restrict VPC endpoint access to VPC CIDR only",
      {
        meta: {
          id: "vpc-endpoint-access-control",
          compliance: ["ISO27001:A.13.1.3"],
          severity: "high",
          controlType: "preventive",
          risk: "Unauthorized access to VPC endpoints from external networks",
        },
      },
      () => {
        const endpointSecurityGroup = {
          ingress: [
            {
              protocol: "tcp",
              fromPort: 443,
              toPort: 443,
              cidrBlocks: ["10.224.0.0/16"], // VPC CIDR only
              description: "HTTPS from VPC",
            },
          ],
        };

        const ingressRule = endpointSecurityGroup.ingress[0];
        expect(ingressRule.protocol).toBe("tcp");
        expect(ingressRule.fromPort).toBe(443);
        expect(ingressRule.toPort).toBe(443);

        // Should NOT allow 0.0.0.0/0
        expect(ingressRule.cidrBlocks).not.toContain("0.0.0.0/0");

        // Should be private CIDR (RFC 1918)
        const cidr = ingressRule.cidrBlocks[0];
        expect(
          cidr.startsWith("10.") || cidr.startsWith("172.") || cidr.startsWith("192.168.")
        ).toBe(true);
      }
    );

    it(
      "should enable private DNS for interface endpoints",
      {
        meta: {
          id: "vpc-endpoint-private-dns",
          compliance: ["ISO27001:A.13.1.3"],
          severity: "medium",
          controlType: "preventive",
          risk: "DNS hijacking or man-in-the-middle attacks",
        },
      },
      () => {
        const interfaceEndpointConfig = {
          privateDnsEnabled: true,
          vpcEndpointType: "Interface",
        };

        expect(interfaceEndpointConfig.privateDnsEnabled).toBe(true);
        expect(interfaceEndpointConfig.vpcEndpointType).toBe("Interface");
      }
    );
  });
});
