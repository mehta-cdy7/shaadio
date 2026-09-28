# Mandatory security tests

One file per rule group from SYSTEM_DESIGN §91, DATABASE_DESIGN §6.5 and API_DESIGN §30.
These must pass in CI. Every new tenant model or endpoint adds its isolation tests here in the
same change. Name files `*.int.test.ts` so they run against the in-memory replica set.
