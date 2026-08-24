import type { Participant } from "./types";

export type ParticipantContact = {
  phone?: string | null;
  pPhone?: string | null;
};

export type PublicParticipant = Omit<Participant, "phone" | "pPhone">;

function meaningful(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function splitParticipant(participant: Participant): {
  publicValue: PublicParticipant;
  privateValue: ParticipantContact | null;
} {
  const { phone, pPhone, ...publicValue } = participant;
  const normalizedPhone = meaningful(phone);
  const normalizedParentPhone = meaningful(pPhone);
  const privateValue = normalizedPhone || normalizedParentPhone
    ? { ...(normalizedPhone ? { phone: normalizedPhone } : {}), ...(normalizedParentPhone ? { pPhone: normalizedParentPhone } : {}) }
    : null;
  return { publicValue, privateValue };
}

export function splitParticipants(participants: Record<string, Participant>): {
  publicParticipants: Record<string, PublicParticipant>;
  contacts: Record<string, ParticipantContact>;
} {
  const publicParticipants: Record<string, PublicParticipant> = {};
  const contacts: Record<string, ParticipantContact> = {};
  for (const [key, participant] of Object.entries(participants)) {
    const split = splitParticipant(participant);
    publicParticipants[key] = split.publicValue;
    if (split.privateValue) contacts[key] = split.privateValue;
  }
  return { publicParticipants, contacts };
}

/**
 * 과도기에는 공개 participants에 남은 연락처도 읽는다. 비공개 값이 있으면 항상 우선해
 * 마이그레이션을 한 번에 적용하지 못해도 관리자 화면이 끊기지 않게 한다.
 */
export function mergeParticipantContacts(
  participants: Record<string, Participant>,
  contacts: Record<string, ParticipantContact>,
): Record<string, Participant> {
  return Object.fromEntries(Object.entries(participants).map(([key, participant]) => {
    const contact = contacts[key];
    if (!contact) return [key, participant];
    return [key, {
      ...participant,
      ...(contact.phone !== undefined ? { phone: contact.phone } : {}),
      ...(contact.pPhone !== undefined ? { pPhone: contact.pPhone } : {}),
    }];
  }));
}
