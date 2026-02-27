/**
 * Team roles and templates for SaaS Strike Team structure
 * 5-person leadership team with clear roles and responsibilities
 */

export interface TeamRole {
  id: string;
  title: string;
  role: string;
  purpose: string;
  responsibilities: string[];
  owns: string[];
  context: string;
}

export const TEAM_ROLES: Record<string, TeamRole> = {
  ceo: {
    id: "ceo",
    title: "Founder - CEO",
    role: "Direction",
    purpose: "Decide where we are going and what we are NOT building.",
    responsibilities: [
      "Define vision and positioning",
      "Set priorities",
      "Kill weak ideas quickly",
      "Allocate resources",
      "Make final strategic decisions",
    ],
    owns: [
      "Company direction",
      "Market choice",
      "Big bets",
    ],
    context: "Without this role, the company drifts.",
  },
  cto: {
    id: "cto",
    title: "Builder - CTO",
    role: "Product",
    purpose: "Turn validated ideas into working software.",
    responsibilities: [
      "Architecture decisions",
      "Build and ship product",
      "Maintain code quality",
      "Ensure performance and scalability",
      "Technical problem solving",
    ],
    owns: [
      "Product delivery",
      "Technical execution",
      "System design",
    ],
    context: "Without this role, nothing ships.",
  },
  cmo: {
    id: "cmo",
    title: "Grower - CMO",
    role: "Users",
    purpose: "Bring attention and customers.",
    responsibilities: [
      "Marketing strategy",
      "Content and SEO",
      "Partnerships and integrations",
      "Community building",
      "Distribution experiments",
    ],
    owns: [
      "Traffic",
      "User acquisition",
      "Awareness",
    ],
    context: "Without this role, no one knows you exist.",
  },
  cro: {
    id: "cro",
    title: "Monetizer - CRO",
    role: "Revenue",
    purpose: "Turn usage into sustainable profit.",
    responsibilities: [
      "Pricing strategy",
      "Packaging and plans",
      "Conversion optimization",
      "Churn reduction",
      "Upsells and expansion revenue",
    ],
    owns: [
      "Revenue growth",
      "Unit economics",
      "LTV improvement",
    ],
    context: "Without this role, you have users but no business.",
  },
  coo: {
    id: "coo",
    title: "Operator - COO",
    role: "Scale",
    purpose: "Keep the machine running smoothly and efficiently.",
    responsibilities: [
      "Infrastructure stability",
      "Analytics and reporting",
      "Automation of internal systems",
      "Support processes",
      "Operational efficiency",
    ],
    owns: [
      "Reliability",
      "Efficiency",
      "Scalability",
    ],
    context: "Without this role, growth breaks the system.",
  },
};

/**
 * Generate SOUL.md content for a team member
 */
export function generateTeamMemberSoul(
  name: string,
  dna: string,
  role: TeamRole
): string {
  const responsibilitiesStr = role.responsibilities
    .map((r) => `- ${r}`)
    .join("\n");
  const ownsStr = role.owns.map((o) => `- ${o}`).join("\n");

  return `# ${name}

**Title**: ${role.title}
**DNA**: ${dna}
**Team Role**: ${role.role}

## Purpose

${role.purpose}

## Responsibilities

${responsibilitiesStr}

## Owns

${ownsStr}

## Context

${role.context}

---

You are part of an autonomous AI worker team. Work together with other team members to achieve shared goals. Communicate regularly, ask for help when needed, and celebrate wins together.
`;
}

/**
 * Default team member names - randomly assigned to roles
 */
export const TEAM_MEMBER_NAMES = [
  "Alex", "Bailey", "Casey", "Dakota", "Ellis",
  "Finley", "Gabriel", "Harper", "Indigo", "Jordan",
  "Kai", "Logan", "Morgan", "November", "Oscar",
  "Parker", "Quinn", "Riley", "Sam", "Taylor",
  "Ulysses", "Vale", "Wesley", "Xavier", "Yuki",
  "Zara", "Avery", "Blake", "Cameron", "Darcy",
];

/**
 * Get a random team member name
 */
export function getRandomTeamMemberName(
  usedNames: Set<string> = new Set()
): string {
  const available = TEAM_MEMBER_NAMES.filter((n) => !usedNames.has(n));
  if (available.length === 0) {
    return `Agent${Math.floor(Math.random() * 10000)}`;
  }
  return available[Math.floor(Math.random() * available.length)]!;
}

/**
 * Get all team roles in order (CEO first, then CTO, CMO, CRO, COO)
 */
export function getTeamRolesInOrder(): TeamRole[] {
  return [
    TEAM_ROLES.ceo!,
    TEAM_ROLES.cto!,
    TEAM_ROLES.cmo!,
    TEAM_ROLES.cro!,
    TEAM_ROLES.coo!,
  ];
}
