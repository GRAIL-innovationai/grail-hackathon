import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_submission as vs  # noqa: E402

MB = 1024 * 1024
VALID_README = (
    "# Rocket\n\n## Team\n- Ada Lovelace — @ada\n\n## Summary\nA thing.\n\n"
    "## Demo\nhttps://example.com/video\n\n## How to run\n`python main.py`\n"
)


class SubmissionCase(unittest.TestCase):
    """Builds a temp repo with event umn-2026 and a valid team folder team-rocket."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.event = self.root / "submissions" / "umn-2026"
        self.event.mkdir(parents=True)
        (self.event / "README.md").write_text("# UMN 2026\n", encoding="utf-8")
        self.team = self.event / "team-rocket"
        self.write("README.md", VALID_README)
        self.write("main.py", "print('hi')\n")

    def write(self, rel, text="x", folder=None):
        path = (folder or self.team) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def sized(self, rel, size):
        path = self.team / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            f.truncate(size)
        return path

    def errors(self, folder=None):
        return vs.validate_folder(folder or self.team, self.root)

    def assertOneError(self, errors, text):
        self.assertEqual(len(errors), 1, errors)
        self.assertIn(text, errors[0])


class FolderModeTest(SubmissionCase):
    def test_valid_submission_passes(self):
        self.assertEqual(self.errors(), [])

    def test_missing_readme(self):
        (self.team / "README.md").unlink()
        self.assertOneError(self.errors(), "Missing submissions/umn-2026/team-rocket/README.md")

    def test_readme_wrong_case(self):
        (self.team / "README.md").unlink()
        self.write("readme.md", VALID_README)
        self.assertOneError(self.errors(), "Rename submissions/umn-2026/team-rocket/readme.md to README.md")

    def test_missing_heading(self):
        self.write("README.md", VALID_README.replace("## Demo", "Demo"))
        self.assertOneError(self.errors(), "missing the '## Demo' section")

    def test_headings_ignore_case_and_trailing_colon(self):
        self.write("README.md", "## TEAM\n## summary:\n## Demo ##\n## How To Run:\n")
        self.assertEqual(self.errors(), [])

    def test_readme_with_bom_and_crlf(self):
        self.write("README.md", "﻿## Team\r\n## Summary\r\n## Demo\r\n## How to run\r\n")
        self.assertEqual(self.errors(), [])

    def test_level_three_heading_does_not_count(self):
        self.write("README.md", VALID_README.replace("## Demo", "### Demo"))
        self.assertOneError(self.errors(), "'## Demo'")

    def test_bad_team_slug(self):
        team = self.event / "Team_Rocket"
        self.write("README.md", VALID_README, folder=team)
        self.assertOneError(self.errors(team), "Team folder name 'Team_Rocket'")

    def test_template_is_not_a_team_name(self):
        team = self.event / "_template"
        self.write("README.md", VALID_README, folder=team)
        self.assertOneError(self.errors(team), "Team folder name '_template'")

    def test_unknown_event(self):
        team = self.root / "submissions" / "typo-2026" / "team-rocket"
        self.write("README.md", VALID_README, folder=team)
        self.assertOneError(self.errors(team), "Unknown event 'typo-2026'. Use one of: umn-2026")

    def test_forbidden_directories(self):
        for rel in ["node_modules/x.js", ".venv/bin/python", "venv/lib/a.py", "src/__pycache__/a.pyc", "lib/.git/HEAD"]:
            self.write(rel)
        errors = self.errors()
        self.assertEqual(len(errors), 5, errors)
        for rel in ["node_modules/", ".venv/", "venv/", "src/__pycache__/", "lib/.git/"]:
            self.assertTrue(any(f"team-rocket/{rel}" in e for e in errors), rel)

    def test_names_differing_only_in_case(self):
        self.write("Main.py", "print('hi')\n")
        self.assertOneError(self.errors(), "differ only in letter case")

    def test_env_files_rejected_but_example_allowed(self):
        for name in [".env", ".env.local", ".env.example"]:
            self.write(name)
        errors = self.errors()
        self.assertEqual(len(errors), 2, errors)
        self.assertFalse(any(e.startswith("Remove submissions/umn-2026/team-rocket/.env.example") for e in errors))

    def test_private_keys_rejected(self):
        for name in ["server.pem", "tls.key", "id_rsa", "id_rsa.pub"]:
            self.write(name)
        errors = self.errors()
        self.assertEqual(len(errors), 4, errors)
        self.assertTrue(all("rotate it" in e for e in errors))

    def test_ds_store_rejected(self):
        self.write("assets/.DS_Store")
        self.assertOneError(self.errors(), "assets/.DS_Store (macOS metadata)")

    def test_git_file_rejected(self):
        self.write(".git")
        self.assertOneError(
            self.errors(), "Remove submissions/umn-2026/team-rocket/.git: it makes this folder a git submodule"
        )

    def test_file_over_10mb_rejected(self):
        self.sized("model.bin", 10 * MB + 1)
        self.assertOneError(self.errors(), "model.bin is 10.0 MB (limit 10 MB)")

    def test_file_of_exactly_10mb_allowed(self):
        self.sized("model.bin", 10 * MB)
        self.assertEqual(self.errors(), [])

    def test_total_over_50mb_rejected(self):
        for i in range(6):
            self.sized(f"data/part{i}.bin", 9 * MB)
        self.assertOneError(self.errors(), "(limit 50 MB)")

    def test_dangling_symlink_does_not_crash(self):
        try:
            os.symlink("/nonexistent/target", self.team / "link")
        except (OSError, NotImplementedError):
            self.skipTest("symlinks not supported here")
        self.assertEqual(self.errors(), [])

    def test_missing_folder(self):
        self.assertOneError(self.errors(self.event / "no-such-team"), "is not a folder")

    def test_event_folder_is_not_a_team_folder(self):
        self.assertOneError(self.errors(self.event), "must be a team folder directly inside an event")

    def test_folder_outside_submissions(self):
        other = self.root / "elsewhere"
        other.mkdir()
        self.assertOneError(self.errors(other), "must be a team folder directly inside an event")

    def test_relative_path_with_trailing_slash(self):
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(self.root)
        self.assertEqual(vs.validate_folder("submissions/umn-2026/team-rocket/", self.root), [])


class ChangedFilesTest(SubmissionCase):
    def changed(self, paths, organizer=False):
        return vs.validate_changed(paths, self.root, organizer)

    def test_single_team_passes(self):
        paths = ["submissions/umn-2026/team-rocket/README.md", "submissions/umn-2026/team-rocket/main.py"]
        self.assertEqual(self.changed(paths), [])

    def test_changed_team_folder_is_checked(self):
        self.write(".env")
        self.assertOneError(self.changed(["submissions/umn-2026/team-rocket/.env"]), "team-rocket/.env")

    def test_root_file_rejected(self):
        errors = self.changed(["README.md", "submissions/umn-2026/team-rocket/main.py"])
        self.assertOneError(errors, "README.md is outside a team folder")

    def test_event_readme_and_template_rejected(self):
        errors = self.changed(["submissions/umn-2026/README.md", "submissions/_template/README.md"])
        self.assertEqual(len(errors), 2, errors)
        self.assertTrue(all("outside a team folder" in e for e in errors))

    def test_two_teams_rejected(self):
        self.write("README.md", VALID_README, folder=self.event / "team-comet")
        paths = ["submissions/umn-2026/team-rocket/main.py", "submissions/umn-2026/team-comet/README.md"]
        self.assertOneError(self.changed(paths), "several team folders")

    def test_no_changes_rejected(self):
        self.assertOneError(self.changed([]), "changes no files")

    def test_many_outside_paths_are_summarised(self):
        errors = self.changed([f"file{i}.py" for i in range(25)])
        self.assertEqual(len(errors), 11, errors)
        self.assertIn("...and 15 more", errors[-1])

    def test_deleted_team_folder_is_skipped(self):
        self.assertEqual(self.changed(["submissions/umn-2026/gone-team/main.py"]), [])

    def test_paths_with_spaces_and_unicode(self):
        self.write("my notes/café.md")
        self.assertEqual(self.changed(["submissions/umn-2026/team-rocket/my notes/café.md"]), [])

    def test_organizer_may_change_root_and_several_teams(self):
        self.write("README.md", VALID_README, folder=self.event / "team-comet")
        paths = [
            "README.md",
            "submissions/umn-2026/README.md",
            "submissions/_template/README.md",
            "submissions/umn-2026/team-rocket/main.py",
            "submissions/umn-2026/team-comet/README.md",
        ]
        self.assertEqual(self.changed(paths, organizer=True), [])

    def test_organizer_changes_still_check_team_folders(self):
        self.write(".env")
        errors = self.changed(["README.md", "submissions/umn-2026/team-rocket/.env"], organizer=True)
        self.assertOneError(errors, "team-rocket/.env")

    def test_organizer_with_no_changes_passes(self):
        self.assertEqual(self.changed([], organizer=True), [])


class MainTest(SubmissionCase):
    def run_main(self, *argv):
        out = StringIO()
        with redirect_stdout(out):
            code = vs.main([*argv, "--root", str(self.root)])
        return code, out.getvalue()

    def changed_list(self, *paths):
        path = self.root / "changed.txt"
        path.write_text("\n".join(paths) + "\n", encoding="utf-8")
        return str(path)

    def test_valid_folder_exits_0(self):
        code, out = self.run_main(str(self.team))
        self.assertEqual(code, 0)
        self.assertIn("OK: submission looks good.", out)

    def test_invalid_folder_exits_1(self):
        (self.team / "README.md").unlink()
        code, out = self.run_main(str(self.team))
        self.assertEqual(code, 1)
        self.assertIn("ERROR: Missing", out)
        self.assertIn("1 problem(s) found", out)

    def test_changed_files_mode(self):
        listing = self.changed_list("submissions/umn-2026/team-rocket/main.py")
        self.assertEqual(self.run_main("--changed-files", listing)[0], 0)

    def test_organizer_flag(self):
        listing = self.changed_list("README.md")
        self.assertEqual(self.run_main("--changed-files", listing)[0], 1)
        self.assertEqual(self.run_main("--changed-files", listing, "--organizer")[0], 0)

    def test_usage_errors_exit_2(self):
        listing = self.changed_list("README.md")
        for argv in [[], [str(self.team), "--changed-files", listing], [str(self.team), "--organizer"]]:
            with self.subTest(argv=argv), redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    self.run_main(*argv)
                self.assertEqual(ctx.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
