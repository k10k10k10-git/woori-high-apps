import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const inputDir = args.get("--input");
const updatesFile = args.get("--updates");
const reportFile = args.get("--report");
if (!inputDir || !updatesFile || !reportFile) {
  throw new Error("--input <백업 디렉터리> --updates <파일> --report <파일>이 필요합니다.");
}

const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const meaningful = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const [retreats, retreatsPrivate] = await Promise.all([
  readFile(resolve(inputDir, "retreats.json"), "utf8").then(JSON.parse),
  readFile(resolve(inputDir, "retreatsPrivate.json"), "utf8").then(JSON.parse),
]);

const updates = {};
const conflicts = [];
let participants = 0;
let contactParticipants = 0;
let publicFieldsRemoved = 0;
let privateRecordsWritten = 0;

for (const [retreatId, retreatValue] of Object.entries(asRecord(retreats))) {
  const publicParticipants = asRecord(asRecord(retreatValue).participants);
  const privateContacts = asRecord(asRecord(asRecord(retreatsPrivate)[retreatId]).participantContacts);
  for (const [participantKey, participantValue] of Object.entries(publicParticipants)) {
    participants += 1;
    const participant = asRecord(participantValue);
    const existing = asRecord(privateContacts[participantKey]);
    const publicPhone = meaningful(participant.phone);
    const publicParentPhone = meaningful(participant.pPhone);
    if (!publicPhone && !publicParentPhone) continue;
    contactParticipants += 1;

    const next = { ...existing };
    if (publicPhone && !meaningful(existing.phone)) next.phone = publicPhone;
    else if (publicPhone && meaningful(existing.phone) !== publicPhone) conflicts.push(`${retreatId}/${participantKey}/phone`);
    if (publicParentPhone && !meaningful(existing.pPhone)) next.pPhone = publicParentPhone;
    else if (publicParentPhone && meaningful(existing.pPhone) !== publicParentPhone) conflicts.push(`${retreatId}/${participantKey}/pPhone`);

    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      updates[`retreatsPrivate/${retreatId}/participantContacts/${participantKey}`] = next;
      privateRecordsWritten += 1;
    }
    if (Object.hasOwn(participant, "phone")) {
      updates[`retreats/${retreatId}/participants/${participantKey}/phone`] = null;
      publicFieldsRemoved += 1;
    }
    if (Object.hasOwn(participant, "pPhone")) {
      updates[`retreats/${retreatId}/participants/${participantKey}/pPhone`] = null;
      publicFieldsRemoved += 1;
    }
  }
}

const report = {
  mode: "dry-run-plan",
  participants,
  contactParticipants,
  privateRecordsWritten,
  publicFieldsRemoved,
  updatePaths: Object.keys(updates).length,
  conflicts,
  untouched: ["retreats/*/participantsBackups", "retreatsPrivate/*/participantContactsBackups"],
};

await writeFile(resolve(updatesFile), `${JSON.stringify(updates, null, 2)}\n`);
await writeFile(resolve(reportFile), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
