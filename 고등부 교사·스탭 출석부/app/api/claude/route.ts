import { NextRequest, NextResponse } from 'next/server';

/**
 * Claude API Route (준비됨 — API 키 설정 후 사용)
 *
 * .env.local 에 ANTHROPIC_API_KEY=sk-ant-... 추가 후 아래 로직을 구현하세요.
 * SDK: npm install @anthropic-ai/sdk
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const body = await request.json();

    // TODO: Anthropic SDK 연동 예시
    // import Anthropic from '@anthropic-ai/sdk';
    // const client = new Anthropic({ apiKey });
    // const message = await client.messages.create({
    //   model: 'claude-opus-4-5',
    //   max_tokens: 1024,
    //   messages: [{ role: 'user', content: body.prompt }],
    // });
    // return NextResponse.json({ result: message.content });

    return NextResponse.json({ message: 'Claude API 준비 완료', received: body });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
