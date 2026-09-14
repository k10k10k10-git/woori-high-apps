import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const sourceRoot = path.resolve(process.cwd(), "src");
const directWriters = new Set(["set", "update", "remove", "runTransaction", "setWithPriority", "setPriority", "onDisconnect"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    return /\.tsx?$/.test(entry.name) && !/\.(?:render\.)?test\.tsx?$/.test(entry.name) ? [filename] : [];
  });
}

describe("통합 앱 활동 로그 쓰기 경계", () => {
  it("새 업무 모듈도 로그 도우미를 통하고 push는 키 생성 용도로만 사용한다", () => {
    const violations: string[] = [];
    for (const filename of sourceFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, filename).replaceAll(path.sep, "/");
      if (relative === "features/activityLog/write.ts") continue;
      const text = readFileSync(filename, "utf8");
      // 대부분의 UI 파일은 TypeScript 파싱 전에 제외한다. 이스케이프된 모듈명 우회는
      // \u·\x가 있는 파일도 전처리 대상으로 남겨 계약의 탐지 범위를 유지한다.
      if (!text.includes("firebase") && !text.includes("\\u") && !text.includes("\\x")) continue;
      if (!ts.preProcessFile(text, true).importedFiles.some(file => file.fileName.startsWith("firebase/database"))) continue;
      const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
      const pushNames = new Set<string>();
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
          || !statement.moduleSpecifier.text.startsWith("firebase/database")) continue;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) violations.push(`${relative}: namespace import로 직접 쓰기를 우회할 수 있습니다.`);
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const element of bindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (directWriters.has(imported)) violations.push(`${relative}: ${imported} 직접 쓰기`);
          if (imported === "push") pushNames.add(element.name.text);
        }
      }
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
          && pushNames.has(node.expression.text) && node.arguments.length > 1) {
          violations.push(`${relative}: push에 값을 전달해 로그 없이 저장`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
