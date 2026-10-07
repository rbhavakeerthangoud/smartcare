import path from "node:path";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "lib", "smartcare");
const outputRoot = path.join(projectRoot, ".smartcare-test-build");
const sourceFiles = ts.sys.readDirectory(sourceRoot, [".ts"]);

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => ts.sys.newLine,
  });
}

try {
  rmSync(outputRoot, { recursive: true, force: true });
  const program = ts.createProgram(sourceFiles, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: sourceRoot,
    outDir: outputRoot,
    strict: true,
    skipLibCheck: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    process.stderr.write(formatDiagnostics(diagnostics));
    process.exitCode = 1;
  } else {
    const emitResult = program.emit();
    if (emitResult.emitSkipped || emitResult.diagnostics.length > 0) {
      process.stderr.write(formatDiagnostics(emitResult.diagnostics));
      process.exitCode = 1;
    } else {
    const testResult = spawnSync(
      process.execPath,
      ["--test", "tests/smartcare.test.mjs"],
      {
        cwd: projectRoot,
        env: { ...process.env, SMARTCARE_TEST_BUILD: outputRoot },
        stdio: "inherit",
      },
    );
    if (testResult.error) throw testResult.error;
    process.exitCode = testResult.status ?? 1;
    }
  }
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
