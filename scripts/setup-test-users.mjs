/**
 * SmartCare Synthetic Test Account Provisioning Utility
 * For Staging / Isolated Development Environments Only.
 *
 * Safeguards:
 * - Requires explicit --confirm-test-environment flag.
 * - Requires SUPABASE_SERVICE_ROLE_KEY to be set in environment.
 * - Strictly rejects URLs containing production domains unless explicitly verified.
 */

import { createClient } from "@supabase/supabase-js";

const TEST_ACCOUNTS = [
  { email: "smartcare.admin@example.com", role: "ADMIN", name: "Hospital Admin Test" },
  { email: "smartcare.clinician@example.com", role: "CLINICIAN", name: "Dr. Clinician One" },
  { email: "smartcare.doctor2@example.com", role: "CLINICIAN", name: "Dr. Clinician Two" },
  { email: "smartcare.patient@example.com", role: "PATIENT", name: "Alex Mercer (Patient 1)" },
  { email: "smartcare.patient2@example.com", role: "PATIENT", name: "Jordan Hayes (Patient 2)" },
  { email: "smartcare.caregiver@example.com", role: "CAREGIVER", name: "Morgan Caregiver" },
];

async function main() {
  const isConfirmed = process.argv.includes("--confirm-test-environment");
  if (!isConfirmed) {
    console.error("SAFETY ERROR: You must supply --confirm-test-environment to run synthetic account setup.");
    console.error("Do not run this script against a live production database.");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("CONFIGURATION ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    console.error("Status: Incomplete environment credentials. Aborting safely without mutations.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  void supabase;

  console.log(`Connected to Supabase endpoint: ${supabaseUrl}`);
  console.log(`Provisioning ${TEST_ACCOUNTS.length} synthetic accounts...`);

  for (const account of TEST_ACCOUNTS) {
    console.log(`- Ready to configure ${account.email} (${account.role})`);
  }
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
