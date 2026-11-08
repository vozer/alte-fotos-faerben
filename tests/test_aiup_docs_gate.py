"""Exercise the AIUP gate through its command-line interface."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


GATE = Path(__file__).resolve().parents[1] / "scripts" / "check-aiup-docs.sh"
PROBE = "src/main/event.ts"


class DocumentationGateTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory(prefix="aiup-gate-test-")
        self.root = Path(self.tempdir.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base"], check=True)

    def tearDown(self):
        self.tempdir.cleanup()

    def write(self, path, contents):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents)

    def gate(self, base="HEAD"):
        env = {**os.environ, "AIUP_BASE_SHA": base}
        return subprocess.run(["bash", str(GATE)], cwd=self.root, env=env, capture_output=True, text=True)

    def test_unrelated_document_does_not_cover_behavior_change(self):
        self.write(PROBE, "behavior\n")
        self.write("docs/research/note.md", "Unrelated note.\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_workflow_change_requires_a_specification(self):
        self.write(".github/workflows/scheduled.yml", "name: scheduled\n")
        self.write("docs/research/note.md", "Unrelated note.\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_duplicate_use_case_ids_are_rejected(self):
        self.write("docs/use_cases/UC-001-first.md", "First.\n")
        self.write("docs/use_cases/UC-001-second.md", "Second.\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_missing_use_case_reference_is_rejected(self):
        self.write("docs/test_cases/TC-001-journey.md", "Uses UC-123.\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_unknown_requirement_reference_is_rejected(self):
        self.write("docs/requirements.md", "| FR-001 | Existing |\n")
        self.write("docs/use_cases/UC-001-first.md", "Requirement: FR-999\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_duplicate_test_case_ids_are_rejected(self):
        self.write("docs/test_cases/TC-001-first.md", "First.\n")
        self.write("docs/test_cases/TC-001-second.md", "Second.\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_use_case_requires_a_functional_requirement_reference(self):
        self.write("docs/requirements.md", "| FR-001 | Existing |\n")
        self.write("docs/use_cases/UC-001-first.md", "No requirement reference.\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_specification_change_covers_behavior(self):
        self.write(PROBE, "behavior\n")
        self.write("docs/requirements.md", "# Requirements\n")
        result = self.gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_non_behavior_exception_requires_a_reason(self):
        self.write(PROBE, "refactor\n")
        self.write("docs/aiup-exceptions/refactor.md", "Reason: Refactor only; behavior is unchanged.\n")
        result = self.gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_old_exception_cannot_cover_a_new_change(self):
        exception = "docs/aiup-exceptions/prior-refactor.md"
        self.write(exception, "Reason: Earlier refactor left behavior unchanged.\n")
        subprocess.run(["git", "-C", str(self.root), "add", exception], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "exception"], check=True)
        self.write(exception, "Reason: Reused exception for a later code change.\n")
        self.write(PROBE, "behavior\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_renamed_behavior_path_still_requires_a_specification(self):
        self.write(PROBE, "A source file moved without a spec update.\n")
        subprocess.run(["git", "-C", str(self.root), "add", PROBE], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "source"], check=True)
        (self.root / "docs" / "research").mkdir(parents=True)
        subprocess.run(["git", "-C", str(self.root), "mv", PROBE, "docs/research/moved.txt"], check=True)
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_deleted_specification_does_not_cover_behavior(self):
        path = "docs/requirements.md"
        self.write(path, "# Existing requirements\n")
        subprocess.run(["git", "-C", str(self.root), "add", path], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "spec"], check=True)
        (self.root / path).unlink()
        self.write(PROBE, "behavior\n")
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_deleting_a_baseline_specification_is_rejected(self):
        path = "docs/requirements.md"
        self.write(path, "# Existing requirements\n")
        subprocess.run(["git", "-C", str(self.root), "add", path], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "spec"], check=True)
        (self.root / path).unlink()
        result = self.gate()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_invalid_base_is_rejected(self):
        result = self.gate("not-a-commit")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
