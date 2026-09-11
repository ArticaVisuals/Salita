import { headers } from 'next/headers';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
};

function hasAsciiControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get('oai-authenticated-user-id')?.trim();
  const email =
    requestHeaders.get('oai-authenticated-user-email')?.trim() ?? '';
  if (
    !userId ||
    userId.length > 255 ||
    hasAsciiControlCharacter(userId) ||
    email.length > 320 ||
    hasAsciiControlCharacter(email)
  ) {
    return null;
  }
  return { userId, email, displayName: email };
}
