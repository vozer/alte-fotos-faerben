#!/usr/bin/env bash
set -euo pipefail

base="${AIUP_BASE_SHA:-}"
if [[ -z "$base" || "$base" =~ ^0+$ ]]; then
  base="$(git merge-base HEAD origin/main 2>/dev/null || true)"
fi
if [[ -z "$base" ]]; then
  base="$(git rev-parse HEAD^ 2>/dev/null || git rev-parse HEAD)"
fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "AIUP docs gate: cannot resolve base commit '$base'." >&2
  exit 1
fi

for document in docs/vision.md docs/requirements.md docs/entity_model.md docs/use_cases.puml; do
  if git cat-file -e "$base:$document" 2>/dev/null && [[ ! -f "$document" ]]; then
    echo "AIUP docs gate: required baseline was deleted: $document" >&2
    exit 1
  fi
done

changed_files="$({ git diff --no-renames --name-only "$base"; git ls-files --others --exclude-standard; } | sed '/^$/d' | sort -u)"
behavior_files=""
spec_changed=0

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  case "$path" in
    docs/vision.md|docs/requirements.md|docs/entity_model.md|docs/use_cases.puml|docs/use_cases/*.md|docs/test_cases/*.md)
      [[ -f "$path" ]] && spec_changed=1 ;;
    docs/aiup-exceptions/*.md)
      if [[ -f "$path" ]] && ! git cat-file -e "$base:$path" 2>/dev/null && grep -Eq '^Reason: .{10,}' "$path"; then spec_changed=1; fi ;;
    .github/workflows/*|src/*|public/*|scripts/*|tests/*|package.json|package-lock.json|vite.config.ts|tsconfig*.json)
      behavior_files+="  - $path\n" ;;
  esac
done <<< "$changed_files"

python3 - <<'PY'
from collections import Counter
from pathlib import Path
import re
import sys

errors = []
use_cases = sorted(Path("docs/use_cases").glob("UC-*.md"))
use_ids = [match.group(1) for path in use_cases if (match := re.match(r"^(UC-\d{3})-", path.name))]
for identifier, count in Counter(use_ids).items():
    if count > 1:
        errors.append(f"Duplicate use case: {identifier}")
diagram = Path("docs/use_cases.puml")
if diagram.exists():
    diagram_ids = set(re.findall(r"\bUC-\d{3}\b", diagram.read_text(encoding="utf-8")))
    for identifier in sorted(diagram_ids.symmetric_difference(use_ids)):
        errors.append(f"Use case missing from diagram or specification: {identifier}")
test_cases = sorted(Path("docs/test_cases").glob("TC-*.md"))
test_ids = [match.group(1) for path in test_cases if (match := re.match(r"^(TC-\d{3})-", path.name))]
for identifier, count in Counter(test_ids).items():
    if count > 1:
        errors.append(f"Duplicate test case: {identifier}")
for path in test_cases:
    for identifier in sorted(set(re.findall(r"\bUC-\d{3}\b", path.read_text(encoding="utf-8"))) - set(use_ids)):
        errors.append(f"{path}: unknown use case {identifier}")
requirements = Path("docs/requirements.md")
if requirements.exists():
    identifiers = re.findall(r"^\|\s*((?:FR|NFR|C)-\d+)\s*\|", requirements.read_text(encoding="utf-8"), re.MULTILINE)
    for identifier, count in Counter(identifiers).items():
        if count > 1:
            errors.append(f"Duplicate requirement: {identifier}")
    for path in [*use_cases, *test_cases]:
        references = set(re.findall(r"\b(?:FR|NFR|C)-\d+\b", path.read_text(encoding="utf-8")))
        for identifier in sorted(references - set(identifiers)):
            errors.append(f"{path}: unknown requirement {identifier}")
        if path in use_cases and not any(reference.startswith("FR-") for reference in references):
            errors.append(f"{path}: missing functional requirement reference")
if errors:
    print("AIUP docs gate: " + "\n".join(errors), file=sys.stderr)
    sys.exit(1)
PY

if [[ -z "$behavior_files" ]]; then
  echo "AIUP docs gate: no behavior paths changed."
  exit 0
fi

if (( spec_changed == 1 )); then
  echo "AIUP docs gate: passed; behavior and specification changed."
  exit 0
fi

echo "AIUP docs gate: failed; behavior changed without an AIUP specification or documented exception:" >&2
printf '%b' "$behavior_files" >&2
echo "Update the affected AIUP specification and tests in this change." >&2
exit 1
