/**
 * Shared VPC Component for Multi-Account AWS Architecture
 * Copyright (c) Adaptive Technology
 * SPDX-License-Identifier: Apache-2.0
 *
 * Provides centralized VPC infrastructure deployed in ops-sec account
 * and shared across workload accounts via AWS RAM.
 *
 * Architecture:
 * - Single unified component (not 3-layer)
 * - Logical organization: Foundation → Security → Operations → Sharing
 * - All resources deployed atomically in one stack
 * - Protected resources: VPC, subnets (prevent accidental deletion)
 *
 * @compliance ISO27001:A.13.1.1 - Network controls
 * @compliance ISO27001:A.13.1.3 - Segregation of networks
 * @compliance ISO27001:A.9.4.1 - Information access restriction
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * Subnet tier configuration for multi-tier network isolation
 */
export interface SubnetTier {
  /**
   * Tier name (e.g., "public", "app", "hipaa-data", "dmz")
   * Used for subnet naming and identification
   */
  name: string;

  /**
   * Route traffic to internet gateway
   * - true: Public subnet (internet-facing)
   * - false: Private subnet (no direct internet)
   */
  routeToInternet: boolean;

  /**
   * Share this tier via AWS RAM to app accounts
   * - true: Shared (e.g., app, data tiers)
   * - false: Ops-only (e.g., public, dmz tiers)
   */
  shareViaRam: boolean;

  /**
   * CIDR bits for subnet sizing (optional)
   * Default: 6 (creates /22 subnets from /16 VPC = 1,024 IPs)
   * Examples:
   * - 4 = /20 (4,096 IPs) for large tiers
   * - 6 = /22 (1,024 IPs) for standard tiers
   * - 8 = /24 (256 IPs) for small/isolated tiers
   */
  cidrBits?: number;
}

/**
 * Configuration for SharedVpc component
 */
export interface SharedVpcArgs {
  /**
   * Environment this VPC serves (dev, stg, prd)
   * For centralized VPCs in sec account, this should be targetEnvironment
   */
  environment: string;

  /**
   * AWS region for deployment
   */
  region: string;

  /**
   * AWS account ID (used for bucket naming uniqueness)
   */
  accountId: string;

  /**
   * Organization prefix (e.g., "worx", "care")
   */
  orgPrefix: string;

  /**
   * VPC CIDR block (e.g., "10.224.0.0/16")
   */
  vpcCidr: string;

  /**
   * Availability zones to deploy across
   * Example: ["us-east-1a", "us-east-1b", "us-east-1c"]
   */
  availabilityZones: string[];

  /**
   * Subnet tier configuration (optional, defaults to 3-tier: public/private/data)
   * Allows custom network isolation patterns per tenant/compliance requirement
   *
   * Default (if not specified):
   * [
   *   { name: "public", routeToInternet: true, shareViaRam: false },
   *   { name: "private", routeToInternet: false, shareViaRam: true },
   *   { name: "data", routeToInternet: false, shareViaRam: true }
   * ]
   *
   * Healthcare tenant example:
   * [
   *   { name: "public", routeToInternet: true, shareViaRam: false },
   *   { name: "app", routeToInternet: false, shareViaRam: true },
   *   { name: "hipaa-data", routeToInternet: false, shareViaRam: true },
   *   { name: "phi-isolated", routeToInternet: false, shareViaRam: true, cidrBits: 8 }
   * ]
   */
  subnetTiers?: SubnetTier[];

  /**
   * Number of NAT Gateways to deploy (0 = no NAT, use IPv6 egress)
   * - Dev: 0 (cost optimization)
   * - Stg: 2 (multi-AZ)
   * - Prd: 3+ (full HA)
   */
  natGatewayCount?: number;

  /**
   * Enable IPv6 dual-stack
   * Required if natGatewayCount = 0 (for IPv6 egress)
   */
  enableIpv6?: boolean;

  /**
   * Allow IPv6 public ingress on public subnets
   * - true (default): Public subnets get ::/0 → IGW route (globally routable IPv6)
   * - false: No IPv6 public ingress (IPv6 egress-only for private subnets)
   *
   * Security consideration: IPv6 addresses are globally routable by default.
   * For compliance-sensitive workloads (e.g., HIPAA), set to false.
   */
  allowIpv6PublicIngress?: boolean;

  /**
   * Enable DNS hostnames in VPC
   */
  enableDnsHostnames?: boolean;

  /**
   * Enable DNS support in VPC
   */
  enableDnsSupport?: boolean;

  /**
   * VPC Flow Logs configuration
   */
  flowLogs: {
    /**
     * Enable flow logs (from Infisical FLOW_LOGS_ENABLED)
     */
    enabled: boolean;

    /**
     * Traffic type to log
     * - "ALL": All traffic
     * - "ACCEPT": Only accepted traffic
     * - "REJECT": Only rejected traffic (cheapest)
     */
    trafficType: "ALL" | "ACCEPT" | "REJECT";

    /**
     * S3 retention in days (from Infisical RETENTION_DAYS)
     */
    retentionDays?: number;

    /**
     * Custom flow log format (optional)
     * If not specified, uses security-enhanced default format with:
     * - Standard fields: srcaddr, dstaddr, srcport, dstport, protocol, bytes, packets
     * - Security fields: tcp-flags, pkt-srcaddr, pkt-dstaddr (for NAT detection)
     * - Metadata: vpc-id, subnet-id, instance-id, action, log-status
     *
     * Custom format example:
     * "${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${action}"
     *
     * See: https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html#flow-logs-fields
     */
    customFormat?: string;
  };

  /**
   * AWS accounts to share subnets with via RAM
   * Map of account ID to account name
   * Example: { "413639306030": "worx-app-dev" }
   */
  sharedAccounts: { [accountId: string]: string };

  /**
   * VPC endpoints to create
   * Example: ["s3", "dynamodb", "ecr.api", "ecr.dkr"]
   */
  vpcEndpoints?: string[];

  /**
   * Resource tags
   */
  tags: Record<string, string>;

  /**
   * Protect critical resources (VPC, subnets) from accidental deletion
   * - true (default for prd): Prevents destroy without explicit unprotect
   * - false (dev/stg): Allows normal destroy for testing/iteration
   *
   * Recommended settings:
   * - Dev: false (rapid iteration)
   * - Stg: false (testing deployment workflows)
   * - Prd: true (production safety)
   */
  protectResources?: boolean;
}

/**
 * Subnet CIDR allocation helper (tier-agnostic)
 * Calculates CIDR blocks for each tier across all AZs
 */
function calculateSubnetCidrs(
  vpcCidr: string,
  tiers: SubnetTier[],
  azCount: number
): Map<string, string[]> {
  // Validate VPC CIDR format
  const parts = vpcCidr.split("/");
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error(`Invalid CIDR block: ${vpcCidr}`);
  }

  // Result map: tier name -> array of CIDR blocks (one per AZ)
  const tierCidrs = new Map<string, string[]>();

  // Calculate CIDRs for each tier
  let subnetIndex = 0;
  for (const tier of tiers) {
    const subnets: string[] = [];
    const cidrBits = tier.cidrBits ?? 6; // Default: /22 subnets from /16 VPC

    // Allocate one subnet per AZ for this tier
    for (let azIndex = 0; azIndex < azCount; azIndex++) {
      subnets.push(cidrSubnet(vpcCidr, cidrBits, subnetIndex));
      subnetIndex++;
    }

    tierCidrs.set(tier.name, subnets);
  }

  return tierCidrs;
}

/**
 * Simple CIDR subnet calculation (mirrors Terraform cidrsubnet)
 */
function cidrSubnet(cidr: string, newbits: number, netnum: number): string {
  const parts = cidr.split("/");
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error(`Invalid CIDR block: ${cidr}`);
  }

  const baseIp = parts[0];
  const prefix = Number.parseInt(parts[1], 10);
  const newPrefix = prefix + newbits;

  // Convert base IP to 32-bit integer
  const ipParts = baseIp.split(".").map(p => Number.parseInt(p, 10));
  if (ipParts.length !== 4 || ipParts.some(p => Number.isNaN(p))) {
    throw new Error(`Invalid IP address: ${baseIp}`);
  }

  const baseNum =
    ((ipParts[0] ?? 0) << 24) |
    ((ipParts[1] ?? 0) << 16) |
    ((ipParts[2] ?? 0) << 8) |
    (ipParts[3] ?? 0);

  // Calculate subnet offset
  const shift = 32 - newPrefix;
  const subnetNum = netnum << shift;
  const resultNum = (baseNum | subnetNum) >>> 0;

  // Convert back to IP string
  const newIp = [
    (resultNum >>> 24) & 0xff,
    (resultNum >>> 16) & 0xff,
    (resultNum >>> 8) & 0xff,
    resultNum & 0xff,
  ].join(".");

  return `${newIp}/${newPrefix}`;
}

/**
 * Convert AWS region to abbreviated form for resource naming
 * Examples: us-east-1 → use1, us-west-2 → usw2, eu-west-1 → euw1
 */
function getRegionAbbr(region: string): string {
  const regionMap: Record<string, string> = {
    "us-east-1": "use1",
    "us-east-2": "use2",
    "us-west-1": "usw1",
    "us-west-2": "usw2",
    "ca-central-1": "cac1",
    "eu-west-1": "euw1",
    "eu-west-2": "euw2",
    "eu-west-3": "euw3",
    "eu-central-1": "euc1",
    "eu-north-1": "eun1",
    "ap-southeast-1": "apse1",
    "ap-southeast-2": "apse2",
    "ap-northeast-1": "apne1",
    "ap-northeast-2": "apne2",
    "ap-south-1": "aps1",
    "sa-east-1": "sae1",
  };

  return regionMap[region] ?? region;
}

/**
 * Convert AWS availability zone to abbreviated suffix
 * Examples: us-east-1a → use1a, us-west-2b → usw2b
 */
function getAzAbbr(az: string): string {
  const region = az.slice(0, -1);
  const azLetter = az.slice(-1);
  return `${getRegionAbbr(region)}${azLetter}`;
}

/**
 * SharedVpc Component
 *
 * Single unified component that creates:
 * - VPC with IPv4 (+ optional IPv6)
 * - Subnets across all AZs (public, private, data)
 * - Internet Gateway
 * - Optional NAT Gateways
 * - Route tables and associations
 * - VPC Flow Logs
 * - VPC Endpoints
 * - RAM Resource Share for cross-account access
 */
export class SharedVpc extends pulumi.ComponentResource {
  // Outputs
  public readonly vpcId: pulumi.Output<string>;
  public readonly vpcCidr: pulumi.Output<string>;
  public readonly vpcIpv6CidrBlock?: pulumi.Output<string>;
  public readonly publicSubnetIds: pulumi.Output<string[]>;
  public readonly privateSubnetIds: pulumi.Output<string[]>;
  public readonly dataSubnetIds: pulumi.Output<string[]>;
  public readonly internetGatewayId: pulumi.Output<string>;
  public readonly natGatewayIds: pulumi.Output<string[]>;
  public readonly ramShareArn: pulumi.Output<string>;
  public readonly flowLogsBucketArn?: pulumi.Output<string>;

  constructor(name: string, args: SharedVpcArgs, opts?: pulumi.ComponentResourceOptions) {
    super("adaptiveworx:aws:SharedVpc", name, {}, opts);

    const defaultOpts = { parent: this };
    // Use protectResources from args, default to true for safety (production-first)
    const shouldProtect = args.protectResources ?? true;
    const protectedOpts = { parent: this, protect: shouldProtect };

    // ====================
    // AVAILABILITY ZONE VALIDATION
    // ====================
    // Validate AZs belong to the specified region (fail fast)
    // This prevents deploying resources in wrong region due to misconfiguration
    for (const az of args.availabilityZones) {
      if (!az.startsWith(args.region)) {
        throw new Error(
          `Invalid availability zone '${az}' for region '${args.region}'. ` +
            "Expected AZ to start with region name. " +
            "All availability zones must belong to the target region. " +
            `Example: For region 'us-west-2', valid AZs are 'us-west-2a', 'us-west-2b', etc.`
        );
      }
    }

    // Resource naming helpers
    const regionAbbr = getRegionAbbr(args.region);
    const baseName = `${args.orgPrefix}-${args.environment}-ops`;

    // ====================
    // FOUNDATION RESOURCES
    // ====================

    // VPC
    const vpcName = `${baseName}-vpc-${regionAbbr}`;
    const vpc = new aws.ec2.Vpc(
      `${args.environment}-vpc`,
      {
        cidrBlock: args.vpcCidr,
        enableDnsHostnames: args.enableDnsHostnames ?? true,
        enableDnsSupport: args.enableDnsSupport ?? true,
        assignGeneratedIpv6CidrBlock: args.enableIpv6 ?? false,
        tags: {
          ...args.tags,
          Name: vpcName,
          Environment: args.environment,
        },
      },
      protectedOpts
    );

    this.vpcId = vpc.id;
    this.vpcCidr = vpc.cidrBlock;
    if (args.enableIpv6 === true) {
      this.vpcIpv6CidrBlock = vpc.ipv6CidrBlock;
    }

    // Internet Gateway
    const igwName = `${baseName}-igw-${regionAbbr}`;
    const igw = new aws.ec2.InternetGateway(
      `${args.environment}-igw`,
      {
        vpcId: vpc.id,
        tags: {
          ...args.tags,
          Name: igwName,
          Environment: args.environment,
        },
      },
      defaultOpts
    );

    this.internetGatewayId = igw.id;

    // Default subnet tiers (3-tier: public/private/data)
    const subnetTiers: SubnetTier[] = args.subnetTiers ?? [
      { name: "public", routeToInternet: true, shareViaRam: false }, // Ops-only (NAT, LB)
      { name: "private", routeToInternet: false, shareViaRam: true }, // Shared (app workloads)
      { name: "data", routeToInternet: false, shareViaRam: true }, // Shared (databases)
    ];

    // Calculate subnet CIDRs for all tiers
    const tierCidrs = calculateSubnetCidrs(
      args.vpcCidr,
      subnetTiers,
      args.availabilityZones.length
    );

    // Create subnets organized by tier
    const tierSubnets = new Map<string, aws.ec2.Subnet[]>();

    // Create all subnets for all tiers
    for (const tier of subnetTiers) {
      const subnets: aws.ec2.Subnet[] = [];
      const cidrs = tierCidrs.get(tier.name);

      if (cidrs === undefined) {
        throw new Error(`Missing CIDR allocation for tier: ${tier.name}`);
      }

      args.availabilityZones.forEach((az, i) => {
        const azAbbr = getAzAbbr(az); // e.g., "use1a" from "us-east-1a"
        const azSuffix = az.slice(-1); // e.g., "a" from "us-east-1a"
        const cidr = cidrs[i];

        if (cidr === undefined) {
          throw new Error(`Missing CIDR for tier ${tier.name}, AZ index ${i}`);
        }

        // Create subnet for this tier + AZ
        const subnetName = `${baseName}-${tier.name}-${azAbbr}`;
        const subnet = new aws.ec2.Subnet(
          `${args.environment}-${tier.name}-${azSuffix}`,
          {
            vpcId: vpc.id,
            cidrBlock: cidr,
            availabilityZone: az,
            mapPublicIpOnLaunch: tier.routeToInternet, // Public subnets get public IPs
            tags: {
              ...args.tags,
              Name: subnetName,
              Environment: args.environment,
              Tier: tier.name,
              Type: tier.routeToInternet ? "public" : "private",
              ShareViaRam: tier.shareViaRam.toString(),
              AZ: az,
            },
          },
          protectedOpts
        );
        subnets.push(subnet);
      });

      tierSubnets.set(tier.name, subnets);
    }

    // Backward compatibility: extract standard tier subnets for outputs
    const publicSubnets = tierSubnets.get("public") ?? [];
    const privateSubnets = tierSubnets.get("private") ?? [];
    const dataSubnets = tierSubnets.get("data") ?? [];

    this.publicSubnetIds = pulumi.output(publicSubnets.map(s => s.id));
    this.privateSubnetIds = pulumi.output(privateSubnets.map(s => s.id));
    this.dataSubnetIds = pulumi.output(dataSubnets.map(s => s.id));

    // NAT Gateways (if enabled)
    const natGateways: aws.ec2.NatGateway[] = [];
    const natGatewayCount = args.natGatewayCount ?? 0;

    if (natGatewayCount > 0) {
      for (let i = 0; i < Math.min(natGatewayCount, publicSubnets.length); i++) {
        const az = args.availabilityZones[i];
        const subnet = publicSubnets[i];

        if (az === undefined || subnet === undefined) {
          throw new Error(`Missing AZ or subnet for NAT Gateway index ${i}`);
        }

        const azAbbr = getAzAbbr(az);
        const azSuffix = az.slice(-1);

        // Elastic IP for NAT Gateway
        const eipName = `${baseName}-nat-eip-${azAbbr}`;
        const eip = new aws.ec2.Eip(
          `${args.environment}-nat-eip-${azSuffix}`,
          {
            domain: "vpc",
            tags: {
              ...args.tags,
              Name: eipName,
              Environment: args.environment,
            },
          },
          defaultOpts
        );

        // NAT Gateway
        const natName = `${baseName}-nat-${azAbbr}`;
        const natGw = new aws.ec2.NatGateway(
          `${args.environment}-nat-${azSuffix}`,
          {
            subnetId: subnet.id,
            allocationId: eip.id,
            tags: {
              ...args.tags,
              Name: natName,
              Environment: args.environment,
            },
          },
          defaultOpts
        );
        natGateways.push(natGw);
      }
    }

    this.natGatewayIds = pulumi.output(natGateways.map(ng => ng.id));

    // ====================
    // HIGH AVAILABILITY VALIDATION
    // ====================

    // Warn if NAT Gateway count < AZ count (not HA)
    // Single NAT Gateway = single point of failure for all private subnet egress
    if (natGatewayCount > 0 && natGatewayCount < args.availabilityZones.length) {
      void pulumi.log.warn(
        `NAT Gateway HA concern: NAT count (${natGatewayCount}) < AZ count (${args.availabilityZones.length}). ` +
          "Private subnets across multiple AZs share fewer NAT Gateways, creating potential single points of failure. " +
          `For full HA, set natGatewayCount >= ${args.availabilityZones.length} (one NAT per AZ). ` +
          `Current distribution: Each NAT Gateway serves ${Math.ceil(args.availabilityZones.length / natGatewayCount)} AZs.`
      );
    }

    // ====================
    // EGRESS VALIDATION
    // ====================

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

    // ====================
    // NETWORK ACLs (NACLs)
    // ====================

    // Create NACLs per tier for defense-in-depth (network-layer protection)
    for (const tier of subnetTiers) {
      const tierNacl = new aws.ec2.NetworkAcl(
        `${args.environment}-${tier.name}-nacl`,
        {
          vpcId: vpc.id,
          tags: {
            ...args.tags,
            Name: `${args.environment}-${tier.name}-nacl`,
            Environment: args.environment,
            Tier: tier.name,
          },
        },
        defaultOpts
      );

      // NACL rules depend on tier type
      if (tier.routeToInternet) {
        // Public tier NACL: Allow HTTP/HTTPS inbound, ephemeral outbound

        // Inbound: HTTPS (443)
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-https-in`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 100,
            protocol: "tcp",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            fromPort: 443,
            toPort: 443,
            egress: false,
          },
          defaultOpts
        );

        // Inbound: HTTP (80) - for redirect to HTTPS
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-http-in`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 110,
            protocol: "tcp",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            fromPort: 80,
            toPort: 80,
            egress: false,
          },
          defaultOpts
        );

        // Inbound: Ephemeral ports (for return traffic)
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-ephemeral-in`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 120,
            protocol: "tcp",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            fromPort: 1024,
            toPort: 65535,
            egress: false,
          },
          defaultOpts
        );

        // Outbound: Allow all (stateful response traffic)
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-all-out`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 100,
            protocol: "-1",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            egress: true,
          },
          defaultOpts
        );
      } else {
        // Private tier NACL: Allow VPC-internal + ephemeral, deny direct internet inbound

        // Inbound: All traffic from VPC CIDR
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-vpc-in`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 100,
            protocol: "-1",
            ruleAction: "allow",
            cidrBlock: args.vpcCidr,
            egress: false,
          },
          defaultOpts
        );

        // Inbound: Ephemeral ports from internet (for NAT return traffic)
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-ephemeral-in`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 110,
            protocol: "tcp",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            fromPort: 1024,
            toPort: 65535,
            egress: false,
          },
          defaultOpts
        );

        // Outbound: Allow all (VPC traffic + NAT egress)
        new aws.ec2.NetworkAclRule(
          `${args.environment}-${tier.name}-nacl-all-out`,
          {
            networkAclId: tierNacl.id,
            ruleNumber: 100,
            protocol: "-1",
            ruleAction: "allow",
            cidrBlock: "0.0.0.0/0",
            egress: true,
          },
          defaultOpts
        );
      }

      // Associate NACL with all subnets in this tier
      const subnets = tierSubnets.get(tier.name);
      if (subnets === undefined) {
        throw new Error(`Missing subnets for tier: ${tier.name}`);
      }

      subnets.forEach((subnet, i) => {
        const az = args.availabilityZones[i];
        if (az === undefined) {
          throw new Error(`Missing AZ for ${tier.name} subnet index ${i}`);
        }
        const azSuffix = az.slice(-1);
        new aws.ec2.NetworkAclAssociation(
          `${args.environment}-${tier.name}-nacl-assoc-${azSuffix}`,
          {
            networkAclId: tierNacl.id,
            subnetId: subnet.id,
          },
          defaultOpts
        );
      });
    }

    // ====================
    // ROUTING RESOURCES
    // ====================

    // Track all route table IDs for VPC gateway endpoints
    const allRouteTableIds: pulumi.Output<string>[] = [];

    // Public route table (for tiers with routeToInternet=true)
    const publicTiers = subnetTiers.filter(tier => tier.routeToInternet);

    if (publicTiers.length > 0) {
      const publicRtName = `${baseName}-public-rt-${regionAbbr}`;
      const publicRt = new aws.ec2.RouteTable(
        `${args.environment}-public-rt`,
        {
          vpcId: vpc.id,
          tags: {
            ...args.tags,
            Name: publicRtName,
            Environment: args.environment,
            Type: "public",
          },
        },
        defaultOpts
      );

      // Track route table ID for gateway endpoints
      allRouteTableIds.push(publicRt.id);

      // IPv4 route to internet gateway
      new aws.ec2.Route(
        `${args.environment}-public-route-ipv4`,
        {
          routeTableId: publicRt.id,
          destinationCidrBlock: "0.0.0.0/0",
          gatewayId: igw.id,
        },
        defaultOpts
      );

      // IPv6 route if enabled AND public ingress allowed
      // Default: true (backward compatibility)
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

      // Associate all public tier subnets with public route table
      for (const tier of publicTiers) {
        const subnets = tierSubnets.get(tier.name);
        if (subnets === undefined) {
          throw new Error(`Missing subnets for public tier: ${tier.name}`);
        }

        subnets.forEach((subnet, i) => {
          const az = args.availabilityZones[i];
          if (az === undefined) {
            throw new Error(`Missing AZ for subnet index ${i}`);
          }
          const azSuffix = az.slice(-1);
          new aws.ec2.RouteTableAssociation(
            `${args.environment}-${tier.name}-rta-${azSuffix}`,
            {
              subnetId: subnet.id,
              routeTableId: publicRt.id,
            },
            defaultOpts
          );
        });
      }
    }

    // Private tier route tables (for tiers with routeToInternet=false)
    const privateTiers = subnetTiers.filter(tier => !tier.routeToInternet);

    if (privateTiers.length > 0) {
      if (natGateways.length > 0) {
        // NAT Gateway routing: per-AZ route tables for each private tier
        for (const tier of privateTiers) {
          const subnets = tierSubnets.get(tier.name);
          if (subnets === undefined) {
            throw new Error(`Missing subnets for private tier: ${tier.name}`);
          }

          subnets.forEach((subnet, i) => {
            const az = args.availabilityZones[i];
            if (az === undefined) {
              throw new Error(`Missing AZ for ${tier.name} subnet index ${i}`);
            }
            const azSuffix = az.slice(-1);
            const natIndex = Math.min(i, natGateways.length - 1);
            const natGw = natGateways[natIndex];
            if (natGw === undefined) {
              throw new Error(`Missing NAT Gateway at index ${natIndex}`);
            }

            // Create route table for this tier + AZ
            const azAbbr = getAzAbbr(az);
            const privateRtName = `${baseName}-${tier.name}-rt-${azAbbr}`;
            const privateRt = new aws.ec2.RouteTable(
              `${args.environment}-${tier.name}-rt-${azSuffix}`,
              {
                vpcId: vpc.id,
                tags: {
                  ...args.tags,
                  Name: privateRtName,
                  Environment: args.environment,
                  Tier: tier.name,
                  Type: "private",
                  ShareViaRam: tier.shareViaRam.toString(),
                },
              },
              defaultOpts
            );

            // Track route table ID for gateway endpoints
            allRouteTableIds.push(privateRt.id);

            // IPv4 route to NAT Gateway
            new aws.ec2.Route(
              `${args.environment}-${tier.name}-route-${azSuffix}`,
              {
                routeTableId: privateRt.id,
                destinationCidrBlock: "0.0.0.0/0",
                natGatewayId: natGw.id,
              },
              defaultOpts
            );

            // Associate subnet with route table
            new aws.ec2.RouteTableAssociation(
              `${args.environment}-${tier.name}-rta-${azSuffix}`,
              {
                subnetId: subnet.id,
                routeTableId: privateRt.id,
              },
              defaultOpts
            );
          });
        }
      } else {
        // No NAT Gateways: shared route table with IPv6 egress only
        // Used by all private tiers (check individual tier ShareViaRam tags)
        const sharedRtName = `${baseName}-shared-rt-${regionAbbr}`;
        const sharedRt = new aws.ec2.RouteTable(
          `${args.environment}-shared-rt`,
          {
            vpcId: vpc.id,
            tags: {
              ...args.tags,
              Name: sharedRtName,
              Environment: args.environment,
              Type: "shared",
              SharedByTiers: privateTiers.map(t => t.name).join(","),
            },
          },
          defaultOpts
        );

        // Track route table ID for gateway endpoints
        allRouteTableIds.push(sharedRt.id);

        // IPv6 egress-only gateway if IPv6 is enabled
        if (args.enableIpv6 === true) {
          const eigw = new aws.ec2.EgressOnlyInternetGateway(
            `${args.environment}-eigw`,
            {
              vpcId: vpc.id,
              tags: {
                ...args.tags,
                Name: `${args.environment}-eigw`,
                Environment: args.environment,
              },
            },
            defaultOpts
          );

          new aws.ec2.Route(
            `${args.environment}-shared-route-ipv6`,
            {
              routeTableId: sharedRt.id,
              destinationIpv6CidrBlock: "::/0",
              egressOnlyGatewayId: eigw.id,
            },
            defaultOpts
          );
        }

        // Associate all private tier subnets with shared route table
        for (const tier of privateTiers) {
          const subnets = tierSubnets.get(tier.name);
          if (subnets === undefined) {
            throw new Error(`Missing subnets for private tier: ${tier.name}`);
          }

          subnets.forEach((subnet, i) => {
            const az = args.availabilityZones[i];
            if (az === undefined) {
              throw new Error(`Missing AZ for ${tier.name} subnet index ${i}`);
            }
            const azSuffix = az.slice(-1);
            new aws.ec2.RouteTableAssociation(
              `${args.environment}-${tier.name}-rta-${azSuffix}`,
              {
                subnetId: subnet.id,
                routeTableId: sharedRt.id,
              },
              defaultOpts
            );
          });
        }
      }
    }

    // ====================
    // OPERATIONS RESOURCES
    // ====================

    // S3 Bucket for VPC Flow Logs (conditionally created)
    let flowLogsBucket: aws.s3.Bucket | undefined;
    if (args.flowLogs.enabled) {
      const flowLogsBucketName = `${baseName}-flow-logs-${regionAbbr}`;
      flowLogsBucket = new aws.s3.Bucket(
        `${args.environment}-flow-logs`,
        {
          bucket: `${args.orgPrefix}-flow-logs-${args.environment}-${args.accountId}-${args.region}`,
          tags: {
            ...args.tags,
            Name: flowLogsBucketName,
            Environment: args.environment,
            Purpose: "vpc-flow-logs",
          },
        },
        defaultOpts
      );

      // Enable versioning for flow logs bucket
      // @compliance ISO27001:A.12.3.1 - Information backup
      // @severity medium
      // @control-type corrective
      // @risk Data loss from accidental deletion or corruption
      new aws.s3.BucketVersioning(
        `${args.environment}-flow-logs-versioning`,
        {
          bucket: flowLogsBucket.id,
          versioningConfiguration: {
            status: "Enabled",
          },
        },
        defaultOpts
      );

      // Lifecycle policy for flow logs retention
      if (args.flowLogs.retentionDays !== undefined) {
        new aws.s3.BucketLifecycleConfiguration(
          `${args.environment}-flow-logs-lifecycle`,
          {
            bucket: flowLogsBucket.id,
            rules: [
              {
                id: "expire-flow-logs",
                status: "Enabled",
                expiration: {
                  days: args.flowLogs.retentionDays,
                },
              },
            ],
          },
          defaultOpts
        );
      }

      // Block public access
      // @compliance ISO27001:A.13.1.3 - Segregation of networks
      // @compliance ISO27001:A.9.4.1 - Information access restriction
      // @severity critical
      // @control-type preventive
      // @risk Data breach via public internet exposure
      new aws.s3.BucketPublicAccessBlock(
        `${args.environment}-flow-logs-public-access`,
        {
          bucket: flowLogsBucket.id,
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
        },
        defaultOpts
      );

      // Enable default encryption
      // @compliance ISO27001:A.10.1.1 - Policy on cryptographic controls
      // @compliance ISO27001:A.10.1.2 - Key management
      // @severity critical
      // @control-type preventive
      // @risk Data breach via unencrypted storage
      new aws.s3.BucketServerSideEncryptionConfiguration(
        `${args.environment}-flow-logs-encryption`,
        {
          bucket: flowLogsBucket.id,
          rules: [
            {
              applyServerSideEncryptionByDefault: {
                sseAlgorithm: "AES256",
              },
            },
          ],
        },
        defaultOpts
      );

      // VPC Flow Logs to S3 with security-enhanced format
      // @compliance ISO27001:A.12.4.1 - Event logging
      // @compliance ISO27001:A.12.4.3 - Administrator and operator logs
      // @severity high
      // @control-type detective
      // @risk Undetected network intrusions or data exfiltration
      // Default format includes security fields for threat detection:
      // - tcp-flags: Detect SYN floods, port scans
      // - pkt-srcaddr/pkt-dstaddr: Detect NAT traversal, source spoofing
      // - instance-id: Identify compromised instances
      // AWS VPC Flow Log format string (uses ${} syntax, not JS template literals)
      const defaultSecurityFormat =
        "${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} " +
        "${packets} ${bytes} ${start} ${end} ${action} ${log-status} " +
        "${vpc-id} ${subnet-id} ${instance-id} ${tcp-flags} ${type} " +
        "${pkt-srcaddr} ${pkt-dstaddr}";

      const flowLogName = `${baseName}-vpc-flow-logs-${regionAbbr}`;
      new aws.ec2.FlowLog(
        `${args.environment}-flow-logs`,
        {
          vpcId: vpc.id,
          logDestinationType: "s3",
          logDestination: pulumi.interpolate`arn:aws:s3:::${flowLogsBucket.bucket}/vpc-flow-logs/`,
          trafficType: args.flowLogs.trafficType,
          logFormat: args.flowLogs.customFormat ?? defaultSecurityFormat,
          tags: {
            ...args.tags,
            Name: flowLogName,
            Environment: args.environment,
          },
        },
        defaultOpts
      );

      // Assign flow logs bucket ARN to output
      this.flowLogsBucketArn = flowLogsBucket.arn;
    }

    // ====================
    // SECURITY RESOURCES
    // ====================

    // VPC Endpoints (if configured)
    // @compliance ISO27001:A.13.1.3 - Segregation of networks
    // @compliance ISO27001:A.13.2.1 - Information transfer policies
    // @severity high
    // @control-type preventive
    // @risk Data exfiltration via internet egress
    if (args.vpcEndpoints !== undefined && args.vpcEndpoints.length > 0) {
      // Security group for interface VPC endpoints (443 from VPC CIDR only)
      const vpcEndpointSgName = `${baseName}-vpce-sg-${regionAbbr}`;
      const vpcEndpointSg = new aws.ec2.SecurityGroup(
        `${args.environment}-vpce-sg`,
        {
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
          tags: {
            ...args.tags,
            Name: vpcEndpointSgName,
            Environment: args.environment,
            Purpose: "vpc-endpoints",
          },
        },
        defaultOpts
      );

      // Separate gateway endpoints (free, route table associations) from interface endpoints (cost $)
      const gatewayEndpoints = ["s3", "dynamodb"];
      const interfaceEndpoints = args.vpcEndpoints.filter(ep => !gatewayEndpoints.includes(ep));

      // Create gateway endpoints (free, VPC-wide via route tables)
      for (const service of gatewayEndpoints) {
        if (args.vpcEndpoints?.includes(service) === true) {
          const vpceGatewayName = `${baseName}-vpce-${service}-${regionAbbr}`;
          new aws.ec2.VpcEndpoint(
            `${args.environment}-vpce-${service}`,
            {
              vpcId: vpc.id,
              serviceName: `com.amazonaws.${args.region}.${service}`,
              vpcEndpointType: "Gateway",
              // Gateway endpoints update all associated route tables automatically
              routeTableIds: pulumi.all(allRouteTableIds).apply(ids => ids),
              tags: {
                ...args.tags,
                Name: vpceGatewayName,
                Environment: args.environment,
                Service: service,
                Type: "gateway",
              },
            },
            defaultOpts
          );
        }
      }

      // Create interface endpoints (cost $, subnet-specific, private DNS)
      for (const service of interfaceEndpoints) {
        const vpceInterfaceName = `${baseName}-vpce-${service.replace(/\./g, "-")}-${regionAbbr}`;
        new aws.ec2.VpcEndpoint(
          `${args.environment}-vpce-${service.replace(/\./g, "-")}`,
          {
            vpcId: vpc.id,
            serviceName: `com.amazonaws.${args.region}.${service}`,
            vpcEndpointType: "Interface",
            subnetIds: privateSubnets.map(s => s.id),
            securityGroupIds: [vpcEndpointSg.id],
            privateDnsEnabled: true,
            tags: {
              ...args.tags,
              Name: vpceInterfaceName,
              Environment: args.environment,
              Service: service,
              Type: "interface",
            },
          },
          defaultOpts
        );
      }
    }

    // ====================
    // SHARING RESOURCES
    // ====================

    // RAM Resource Share for cross-account subnet sharing
    // @compliance ISO27001:A.9.4.1 - Information access restriction
    // @compliance ISO27001:A.13.1.3 - Segregation of networks
    // @severity high
    // @control-type preventive
    // @risk Unauthorized cross-account access to network resources
    const ramShareName = `${baseName}-vpc-share-${regionAbbr}`;
    const ramShare = new aws.ram.ResourceShare(
      `${args.environment}-vpc-share`,
      {
        name: ramShareName,
        allowExternalPrincipals: false,
        tags: {
          ...args.tags,
          Name: ramShareName,
          Environment: args.environment,
        },
      },
      defaultOpts
    );

    this.ramShareArn = ramShare.arn;

    // Associate only subnets from tiers with shareViaRam=true
    const sharedTiers = subnetTiers.filter(tier => tier.shareViaRam);
    let subnetAssociationIndex = 0;

    for (const tier of sharedTiers) {
      const subnets = tierSubnets.get(tier.name);
      if (subnets === undefined) {
        throw new Error(`Missing subnets for shared tier: ${tier.name}`);
      }

      for (const subnet of subnets) {
        new aws.ram.ResourceAssociation(
          `${args.environment}-ram-${tier.name}-${subnetAssociationIndex}`,
          {
            resourceArn: subnet.arn,
            resourceShareArn: ramShare.arn,
          },
          defaultOpts
        );
        subnetAssociationIndex++;
      }
    }

    // Associate shared accounts
    for (const [accountId, accountName] of Object.entries(args.sharedAccounts)) {
      new aws.ram.PrincipalAssociation(
        `${args.environment}-ram-${accountName}`,
        {
          principal: accountId,
          resourceShareArn: ramShare.arn,
        },
        defaultOpts
      );
    }

    this.registerOutputs({
      vpcId: this.vpcId,
      vpcCidr: this.vpcCidr,
      vpcIpv6CidrBlock: this.vpcIpv6CidrBlock,
      publicSubnetIds: this.publicSubnetIds,
      privateSubnetIds: this.privateSubnetIds,
      dataSubnetIds: this.dataSubnetIds,
      internetGatewayId: this.internetGatewayId,
      natGatewayIds: this.natGatewayIds,
      ramShareArn: this.ramShareArn,
      flowLogsBucketArn: this.flowLogsBucketArn,
    });
  }
}
