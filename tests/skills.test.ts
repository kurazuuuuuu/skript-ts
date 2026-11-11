import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkillPack } from "../src/cli/skills.js";

const SKILL_MD = "# skript-ts skill\n\nUse this pack.\n";
const WRITING_GUIDE_MD = "# Writing guide\n\nWrite clearly.\n";
const NOTE_MD = "Nested note content.\n";

function makePack(root: string): string {
  const packDir = join(root, "skript-ts");
  mkdirSync(join(packDir, "docs"), { recursive: true });
  writeFileSync(join(packDir, "SKILL.md"), SKILL_MD);
  writeFileSync(join(packDir, "writing-guide.md"), WRITING_GUIDE_MD);
  writeFileSync(join(packDir, "docs", "note.md"), NOTE_MD);
  return packDir;
}

function statusesByFile(result: ReturnType<typeof installSkillPack>): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const file of result.files) {
    statuses.set(file.file, file.status);
  }
  return statuses;
}

describe("installSkillPack", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "skript-ts-skills-"));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("installs every pack file into <skillsDir>/skript-ts", () => {
    const packDir = makePack(tempDir);
    const skillsDir = join(tempDir, "skills");

    const result = installSkillPack({ packDir, skillsDir });
    const targetDir = join(skillsDir, "skript-ts");

    expect(result.pack).toBe("skript-ts");
    expect(result.targetDir).toBe(targetDir);
    expect(result.files).toHaveLength(3);

    const statuses = statusesByFile(result);
    expect([...statuses.keys()].sort()).toEqual(["SKILL.md", "docs/note.md", "writing-guide.md"]);

    for (const file of ["SKILL.md", "writing-guide.md", "docs/note.md"]) {
      expect(statuses.get(file)).toBe("installed");
      const copied = readFileSync(join(targetDir, file));
      const source = readFileSync(join(packDir, file));
      expect(copied.equals(source)).toBe(true);
    }

    expect(readFileSync(join(targetDir, "SKILL.md"), "utf8")).toBe(SKILL_MD);
    expect(readFileSync(join(targetDir, "writing-guide.md"), "utf8")).toBe(WRITING_GUIDE_MD);
    expect(readFileSync(join(targetDir, "docs", "note.md"), "utf8")).toBe(NOTE_MD);
  });

  it("is idempotent", () => {
    const packDir = makePack(tempDir);
    const skillsDir = join(tempDir, "skills");

    const first = installSkillPack({ packDir, skillsDir });
    expect(statusesByFile(first).get("SKILL.md")).toBe("installed");

    const second = installSkillPack({ packDir, skillsDir });
    const statuses = statusesByFile(second);

    expect(second.files).toHaveLength(3);
    expect(statuses.get("SKILL.md")).toBe("unchanged");
    expect(statuses.get("writing-guide.md")).toBe("unchanged");
    expect(statuses.get("docs/note.md")).toBe("unchanged");
  });

  it("reports a changed source file as updated and keeps the others unchanged", () => {
    const packDir = makePack(tempDir);
    const skillsDir = join(tempDir, "skills");
    const targetDir = join(skillsDir, "skript-ts");

    installSkillPack({ packDir, skillsDir });

    const updatedGuide = "# Writing guide\n\nThis is the updated guide.\n";
    writeFileSync(join(packDir, "writing-guide.md"), updatedGuide);

    const result = installSkillPack({ packDir, skillsDir });
    const statuses = statusesByFile(result);

    expect(statuses.get("writing-guide.md")).toBe("updated");
    expect(statuses.get("SKILL.md")).toBe("unchanged");
    expect(statuses.get("docs/note.md")).toBe("unchanged");
    expect(readFileSync(join(targetDir, "writing-guide.md"), "utf8")).toBe(updatedGuide);
  });

  it("reports a newly added pack file as installed", () => {
    const packDir = makePack(tempDir);
    const skillsDir = join(tempDir, "skills");
    const targetDir = join(skillsDir, "skript-ts");

    installSkillPack({ packDir, skillsDir });

    const extraContent = "This file was added later.\n";
    writeFileSync(join(packDir, "extra.md"), extraContent);

    const result = installSkillPack({ packDir, skillsDir });
    const statuses = statusesByFile(result);

    expect(statuses.get("extra.md")).toBe("installed");
    expect(statuses.get("SKILL.md")).toBe("unchanged");
    expect(statuses.get("writing-guide.md")).toBe("unchanged");
    expect(statuses.get("docs/note.md")).toBe("unchanged");
    expect(readFileSync(join(targetDir, "extra.md"), "utf8")).toBe(extraContent);
  });

  it("throws when the pack directory does not exist", () => {
    const missingPackDir = join(tempDir, "missing-pack");
    const skillsDir = join(tempDir, "skills");

    let error: unknown;
    try {
      installSkillPack({ packDir: missingPackDir, skillsDir });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(missingPackDir);
  });

  it("throws when the pack directory has no SKILL.md", () => {
    const packDir = join(tempDir, "skript-ts");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, "other.md"), "not a skill\n");

    let error: unknown;
    try {
      installSkillPack({ packDir, skillsDir: join(tempDir, "skills") });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
  });

  it("leaves unrelated pre-existing files inside the target pack directory untouched", () => {
    const packDir = makePack(tempDir);
    const skillsDir = join(tempDir, "skills");
    const targetDir = join(skillsDir, "skript-ts");
    mkdirSync(targetDir, { recursive: true });

    const unrelatedPath = join(targetDir, "keep.txt");
    const unrelatedContent = "do not delete me\n";
    writeFileSync(unrelatedPath, unrelatedContent);

    const result = installSkillPack({ packDir, skillsDir });
    const statuses = statusesByFile(result);

    expect(readFileSync(unrelatedPath, "utf8")).toBe(unrelatedContent);
    expect(statuses.has("keep.txt")).toBe(false);
    expect(statuses.get("SKILL.md")).toBe("installed");
    expect(statuses.get("writing-guide.md")).toBe("installed");
    expect(statuses.get("docs/note.md")).toBe("installed");
  });
});
