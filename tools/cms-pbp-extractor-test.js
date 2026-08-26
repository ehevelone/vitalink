const {
  extractMedicarePlanIds,
  parseMedicarePlanId,
} = require("./cms-pbp-utils");

const examples = [
  {
    label: "UnitedHealthcare labeled Plan ID",
    text: "UnitedHealthcare | Plan ID: H2802-001-0",
  },
  {
    label: "Devoted card CMS number",
    text: `
      Devoted Health Plans
      Member since 2026
      PENNICA BUCKINGHAM
      DEVOTED CHOICE 001NE (PPO)
      MEMBER ID / RXID DGKW9Y
      CMS H9802-001
      ISSUER 80840
    `,
  },
  {
    label: "Compact no dash format",
    text: "Contract/PBP H2802001",
  },
];

for (const example of examples) {
  console.log(`\n${example.label}`);
  console.log(JSON.stringify(extractMedicarePlanIds(example.text), null, 2));
}

console.log("\nDirect parse example");
console.log(JSON.stringify(parseMedicarePlanId("H2802-001-0"), null, 2));
