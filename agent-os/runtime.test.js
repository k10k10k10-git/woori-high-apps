const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { vercelLatest, runSkill } = require("./server");

test("배포 조회는 스텁 메타데이터를 기존 보고서 형태로 요약한다", async () => {
  const urls = [];
  const readJsonImpl = async (url) => {
    urls.push(url);
    return urls.length === 1 ? { id: "stub project" } : {
      deployments: [{ state: "READY", created: 123, meta: { githubCommitSha: "abcdef12345", githubCommitMessage: "첫 줄\n둘째 줄" } }],
    };
  };
  assert.deepEqual(await vercelLatest("stub", "stub-token", readJsonImpl), {
    state: "READY", sha: "abcdef1", msg: "첫 줄", at: 123,
  });
  assert.match(urls[1], /projectId=stub%20project&limit=1$/);
});

test("배포 메타데이터 형태가 잘못돼도 선택 정보만 비운다", async () => {
  for (const metadata of [
    { githubCommitSha: { toString: null } },
    { githubCommitMessage: 123 },
  ]) {
    let calls = 0;
    const readJsonImpl = async () => ++calls === 1
      ? { id: "stub" }
      : { deployments: [{ meta: metadata }] };
    assert.equal(await vercelLatest("stub", "stub-token", readJsonImpl), null);
  }
});

test("배포 조회 실패나 누락은 보고서 호출자를 reject하지 않는다", async () => {
  const fail = async () => { throw new Error("stub network failure"); };
  assert.equal(await vercelLatest("stub", null, fail), null);
  assert.equal(await vercelLatest("stub", "stub-token", fail), null);
  assert.equal(await vercelLatest("stub", "stub-token", async () => null), null);
});

function runStub({ throwOnSpawn = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const events = [];
  const saves = [];
  let endCalls = 0;
  const response = {
    writableEnded: false,
    destroyed: false,
    writeHead(status) { assert.equal(status, 200); },
    write(line) {
      assert.equal(this.writableEnded, false, "종료 뒤 SSE를 쓰면 안 된다");
      assert.equal(this.destroyed, false, "연결 단절 뒤 SSE를 쓰면 안 된다");
      events.push(JSON.parse(line.slice("data: ".length)));
    },
    end() { endCalls++; this.writableEnded = true; },
  };
  runSkill({ id: "stub", label: "로컬 스텁", prompt: "실행하지 않음", danger: false }, response, {
    spawnImpl(command) {
      assert.equal(command, "claude");
      if (throwOnSpawn) throw new Error("stub synchronous spawn failure");
      return child;
    },
    saveRunImpl(run) { saves.push(structuredClone(run)); },
  });
  return { child, response, events, saves, endCalls: () => endCalls };
}

test("실행 생성 error 뒤 close가 와도 저장과 SSE 완료는 한 번만 한다", () => {
  const run = runStub();
  run.child.emit("error", new Error("stub ENOENT"));
  run.child.emit("close", -2);
  run.child.stdout.write('{"type":"result","result":"늦은 출력"}\n');
  run.child.stderr.write("늦은 stderr");
  assert.equal(run.endCalls(), 1);
  assert.deepEqual(run.events.map(event => event.type), ["start", "end"]);
  assert.equal(run.saves.length, 2);
  assert.equal(run.saves.at(-1).status, "error");
  assert.match(run.saves.at(-1).summary, /stub ENOENT/);
});

test("정상 출력과 완료 결과는 기록하고 한 번 종료한다", () => {
  const run = runStub();
  run.child.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "진행 기록" }] } }) + "\n");
  run.child.stdout.write('{"type":"result","is_error":false,"result":"완료 요약"}\n');
  run.child.emit("close", 0);
  assert.equal(run.endCalls(), 1);
  assert.deepEqual(run.events.map(event => event.type), ["start", "text", "end"]);
  assert.equal(run.saves.at(-1).status, "done");
  assert.equal(run.saves.at(-1).summary, "완료 요약");
  assert.equal(run.saves.at(-1).transcript[0].text, "진행 기록");
});

test("완료 메시지를 받았어도 비정상 종료는 성공으로 기록하지 않는다", () => {
  const run = runStub();
  run.child.stdout.write('{"type":"result","is_error":false,"result":"중간 결과"}\n');
  run.child.emit("close", 1);
  assert.equal(run.saves.at(-1).status, "error");
  assert.equal(run.events.at(-1).data.status, "error");
});

test("동기적인 실행 생성 실패도 한 번 종료하고 오류를 저장한다", () => {
  const run = runStub({ throwOnSpawn: true });
  assert.equal(run.endCalls(), 1);
  assert.equal(run.saves.at(-1).status, "error");
  assert.match(run.saves.at(-1).summary, /stub synchronous spawn failure/);
});

test("브라우저 연결이 닫혀도 실행 기록은 남기고 SSE 쓰기는 중단한다", () => {
  const run = runStub();
  run.response.destroyed = true;
  run.child.stdout.write('{"type":"result","is_error":false,"result":"백그라운드 완료"}\n');
  run.child.emit("close", 0);
  assert.equal(run.endCalls(), 0);
  assert.deepEqual(run.events.map(event => event.type), ["start"]);
  assert.equal(run.saves.at(-1).status, "done");
  assert.equal(run.saves.at(-1).summary, "백그라운드 완료");
});
