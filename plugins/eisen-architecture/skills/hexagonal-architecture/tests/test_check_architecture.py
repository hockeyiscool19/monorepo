"""Tests for scripts/check_architecture.py on synthetic file trees.

Runs under pytest (``python3 -m pytest tests -q``) and under the standard library
(``python3 -m unittest discover -s tests -v``): every test is a unittest.TestCase and
temporary trees come from tempfile, not pytest fixtures.
"""

from __future__ import annotations

import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_DIR / "scripts" / "check_architecture.py"
TEMPLATE = SKILL_DIR / "templates" / "architecture.toml"
sys.path.insert(0, str(SCRIPT.parent))

import check_architecture as ca  # noqa: E402  (path set above so both runners find it)

INIT = '"""Package."""\n'
CLEAN_TREE = {
    "src/demo/__init__.py": INIT,
    "src/demo/domain/__init__.py": INIT,
    "src/demo/domain/models.py": "from pydantic import BaseModel\n\nclass Thing(BaseModel):\n    name: str\n",
    "src/demo/application/__init__.py": INIT,
    "src/demo/application/ports/__init__.py": INIT,
    "src/demo/application/ports/store.py": "from typing import Protocol\n\nfrom demo.domain.models import Thing\n\nclass Store(Protocol):\n    def load(self, request: Thing) -> Thing: ...\n",
    "src/demo/application/things/__init__.py": INIT,
    "src/demo/application/things/service.py": "from demo.application.ports.store import Store\nfrom demo.domain.models import Thing\n",
    "src/demo/adapters/__init__.py": INIT,
    "src/demo/adapters/inbound/__init__.py": INIT,
    "src/demo/adapters/inbound/bootstrap.py": "import os\n\nfrom demo.adapters.outbound.local_store import LocalStore\nfrom demo.application.things.service import Store\n",
    "src/demo/adapters/outbound/__init__.py": INIT,
    "src/demo/adapters/outbound/local_store.py": "import sqlite3\n\nfrom demo.application.ports.store import Store\n",
}
MINIMAL_CONFIG = '[[packages]]\nname = "demo"\nsrc = "src"\n'


def write_tree(root: Path, files: dict[str, str]) -> None:
    """Materialize ``files`` (relative path -> source) under ``root``."""
    for relative, source in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")


def run_main(argv: list[str]) -> tuple[int, str, str]:
    """Run the checker in-process; return (exit code, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = ca.main(argv)
    return code, out.getvalue(), err.getvalue()


class CheckerCase(unittest.TestCase):
    """Base: a fresh temporary directory per test."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name).resolve()
        self.addCleanup(self._tmp.cleanup)

    def check_tree(self, files: dict[str, str], config: str = MINIMAL_CONFIG) -> tuple[int, str, str]:
        write_tree(self.root, {**files, "architecture.toml": config})
        return run_main(["--config", str(self.root / "architecture.toml")])


class CleanTrees(CheckerCase):
    def test_clean_tree_exits_0(self) -> None:
        code, out, err = self.check_tree(CLEAN_TREE)
        self.assertEqual((code, out), (0, ""))
        self.assertIn("1 package(s), 13 module(s), 0 violation(s)", err)

    def test_adapters_may_import_everything_in_package(self) -> None:
        files = {**CLEAN_TREE, "src/demo/adapters/outbound/http_store.py": "import httpx\nfrom demo.adapters.inbound import bootstrap\nfrom demo.domain import models\n"}
        self.assertEqual(self.check_tree(files)[0], 0)

    def test_root_may_import_application(self) -> None:
        files = {**CLEAN_TREE, "src/demo/__init__.py": "from demo.application.things import service\n"}
        self.assertEqual(self.check_tree(files)[0], 0)


class ImportRules(CheckerCase):
    def assert_single_violation(self, files: dict[str, str], path: str, rule: str, line: int) -> str:
        code, out, _ = self.check_tree({**CLEAN_TREE, **files})
        self.assertEqual(code, 1)
        lines = out.splitlines()
        self.assertEqual(len(lines), 1, out)
        self.assertTrue(lines[0].startswith(f"{path}:{line}: {rule}: "), lines[0])
        return lines[0]

    def test_domain_importing_an_adapter_exits_1(self) -> None:
        line = self.assert_single_violation(
            {"src/demo/domain/leak.py": "from demo.adapters.outbound.local_store import LocalStore\n"},
            "src/demo/domain/leak.py", "imports/no-adapters", 1,
        )
        self.assertIn("domain must not import adapters (demo.adapters.outbound.local_store)", line)

    def test_domain_relative_import_of_adapters_exits_1(self) -> None:
        self.assert_single_violation(
            {"src/demo/domain/__init__.py": "\nfrom ..adapters.outbound import local_store\n"},
            "src/demo/domain/__init__.py", "imports/no-adapters", 2,
        )

    def test_from_package_import_adapters_exits_1(self) -> None:
        self.assert_single_violation(
            {"src/demo/domain/leak.py": "from demo import adapters\n"},
            "src/demo/domain/leak.py", "imports/no-adapters", 1,
        )

    def test_domain_importing_httpx_exits_1(self) -> None:
        line = self.assert_single_violation(
            {"src/demo/domain/leak.py": '"""Leak."""\n\nimport httpx\n'},
            "src/demo/domain/leak.py", "imports/no-io", 3,
        )
        self.assertIn("domain must not import I/O module httpx", line)

    def test_domain_importing_application_exits_1(self) -> None:
        self.assert_single_violation(
            {"src/demo/domain/leak.py": "from demo.application.ports.store import Store\n"},
            "src/demo/domain/leak.py", "imports/domain-no-application", 1,
        )

    def test_application_importing_adapters_exits_1(self) -> None:
        self.assert_single_violation(
            {"src/demo/application/things/leak.py": "from demo.adapters.outbound.local_store import LocalStore\n"},
            "src/demo/application/things/leak.py", "imports/no-adapters", 1,
        )

    def test_application_importing_io_inside_a_function_exits_1(self) -> None:
        self.assert_single_violation(
            {"src/demo/application/things/leak.py": "def run() -> None:\n    from urllib import request\n"},
            "src/demo/application/things/leak.py", "imports/no-io", 2,
        )

    def test_root_importing_adapters_exits_1(self) -> None:
        self.assert_single_violation(
            {"src/demo/__init__.py": "from demo.adapters.inbound import bootstrap\n"},
            "src/demo/__init__.py", "imports/no-adapters", 1,
        )

    def test_syntax_error_is_reported_not_raised(self) -> None:
        self.assert_single_violation(
            {"src/demo/domain/broken.py": "def (:\n"}, "src/demo/domain/broken.py", "parse/syntax-error", 1,
        )


class LayoutRules(CheckerCase):
    def test_adapter_outside_inbound_or_outbound_exits_1(self) -> None:
        code, out, _ = self.check_tree({**CLEAN_TREE, "src/demo/adapters/http.py": '"""HTTP."""\n'})
        self.assertEqual(code, 1)
        self.assertEqual(out.strip(), "src/demo/adapters/http.py: layout/adapter-side: adapters must live under adapters/inbound/ or adapters/outbound/")

    def test_module_outside_the_three_layers_exits_1(self) -> None:
        code, out, _ = self.check_tree({**CLEAN_TREE, "src/demo/utils.py": "import os\n"})
        self.assertEqual(code, 1)
        self.assertEqual(out.strip(), "src/demo/utils.py: layout/layer: place modules under domain/, application/ or adapters/")


class CrossPackage(CheckerCase):
    TWO = {
        "packages/core/src/core/__init__.py": INIT,
        "packages/core/src/core/domain/models.py": "X = 1\n",
        "packages/core/src/core/application/ports/store.py": "from core.domain.models import X\n",
        "packages/core/src/core/adapters/outbound/local.py": "from core.application.ports.store import X\n",
        "packages/web/src/web/__init__.py": INIT,
        "packages/web/src/web/application/pages.py": "from core.application.ports.store import X\nfrom core.domain.models import X as Y\n",
    }
    CONFIG = '[[packages]]\nname = "core"\nsrc = "packages/core/src"\n[[packages]]\nname = "web"\nsrc = "packages/web/src"\n'

    def test_cross_package_without_allow_exits_1(self) -> None:
        code, out, _ = self.check_tree(self.TWO, self.CONFIG)
        self.assertEqual(code, 1)
        lines = out.splitlines()
        self.assertEqual(len(lines), 2, out)
        self.assertIn("packages/web/src/web/application/pages.py:1: imports/cross-package: web must not import core.application.ports.store (no [[allow]] rule)", lines[0])

    def test_cross_package_with_allow_exits_0(self) -> None:
        config = self.CONFIG + '[[allow]]\nimporter = "web.application"\nimported = "core.domain"\n[[allow]]\nimporter = "web.application"\nimported = "core.application.ports"\n'
        self.assertEqual(self.check_tree(self.TWO, config)[0], 0)

    def test_allow_is_prefix_scoped_to_the_importer(self) -> None:
        files = {**self.TWO, "packages/web/src/web/domain/leak.py": "from core.adapters.outbound.local import X\n"}
        config = self.CONFIG + '[[allow]]\nimporter = "web.application"\nimported = "core"\n'
        code, out, _ = self.check_tree(files, config)
        self.assertEqual(code, 1)
        self.assertEqual(out.count("imports/cross-package"), 1)
        self.assertIn("web/domain/leak.py:1", out)


class Configuration(CheckerCase):
    def test_malformed_toml_exits_2(self) -> None:
        code, _, err = self.check_tree(CLEAN_TREE, "[[packages]\nname = ")
        self.assertEqual(code, 2)
        self.assertIn("config error", err)

    def test_unknown_key_exits_2(self) -> None:
        code, _, err = self.check_tree(CLEAN_TREE, MINIMAL_CONFIG + "[io]\nextends = true\n")
        self.assertEqual(code, 2)
        self.assertIn("unknown key(s): extends", err)

    def test_missing_package_directory_exits_2(self) -> None:
        code, _, err = self.check_tree(CLEAN_TREE, '[[packages]]\nname = "nope"\n')
        self.assertEqual(code, 2)
        self.assertIn("directory not found", err)

    def test_no_packages_exits_2(self) -> None:
        code, _, err = self.check_tree(CLEAN_TREE, "[io]\nmodules = []\n")
        self.assertEqual(code, 2)
        self.assertIn("no packages configured", err)

    def test_allow_naming_unknown_package_exits_2(self) -> None:
        code, _, err = self.check_tree(CLEAN_TREE, MINIMAL_CONFIG + '[[allow]]\nimporter = "demo.domain"\nimported = "other.domain"\n')
        self.assertEqual(code, 2)
        self.assertIn("does not start with a configured package name", err)

    def test_missing_config_file_exits_2(self) -> None:
        code, _, err = run_main(["--config", str(self.root / "absent.toml")])
        self.assertEqual(code, 2)
        self.assertIn("cannot read", err)

    def test_io_extend_false_replaces_the_builtin_list(self) -> None:
        files = {**CLEAN_TREE, "src/demo/domain/uses_httpx.py": "import httpx\nimport mylib\n"}
        config = MINIMAL_CONFIG + '[io]\nextend = false\nmodules = ["mylib"]\n'
        code, out, _ = self.check_tree(files, config)
        self.assertEqual(code, 1)
        self.assertEqual(out.strip(), "src/demo/domain/uses_httpx.py:2: imports/no-io: domain must not import I/O module mylib")

    def test_cli_flags_without_a_config_file(self) -> None:
        write_tree(self.root, {**CLEAN_TREE, "src/demo/domain/leak.py": "import stripe\n"})
        code, out, _ = run_main(["--root", str(self.root), "--package", "demo=src", "--io-module", "stripe"])
        self.assertEqual(code, 1)
        self.assertIn("imports/no-io: domain must not import I/O module stripe", out)

    def test_root_flag_overrides_the_config_directory(self) -> None:
        write_tree(self.root, {**{k: v for k, v in CLEAN_TREE.items()}, "elsewhere/architecture.toml": MINIMAL_CONFIG})
        code, _, _ = run_main(["--config", str(self.root / "elsewhere/architecture.toml"), "--root", str(self.root)])
        self.assertEqual(code, 0)

    def test_list_io_prints_defaults_plus_extras(self) -> None:
        code, out, _ = self.check_tree(CLEAN_TREE, MINIMAL_CONFIG + '[io]\nmodules = ["extra"]\n')
        self.assertEqual(code, 0)
        code, out, _ = run_main(["--config", str(self.root / "architecture.toml"), "--list-io"])
        self.assertEqual(code, 0)
        self.assertEqual(out.split(), [*ca.DEFAULT_IO_MODULES, "extra"])

    def test_template_config_parses_and_is_self_consistent(self) -> None:
        import tomllib

        config = ca.parse_config(tomllib.loads(TEMPLATE.read_text(encoding="utf-8")), self.root)
        self.assertEqual([p.name for p in config.packages], ["core", "web"])
        self.assertTrue(config.io_extend)
        self.assertIn("stripe", config.effective_io_modules())
        self.assertTrue(all(a.importer.startswith("web.") and a.imported.startswith("core.") for a in config.allows))


class CommandLine(CheckerCase):
    def test_subprocess_exit_codes_and_output_shape(self) -> None:
        write_tree(self.root, {**CLEAN_TREE, "architecture.toml": MINIMAL_CONFIG})
        clean = subprocess.run([sys.executable, str(SCRIPT)], cwd=self.root, capture_output=True, text=True, check=False)
        self.assertEqual((clean.returncode, clean.stdout), (0, ""))
        write_tree(self.root, {"src/demo/domain/leak.py": "import requests\n"})
        dirty = subprocess.run([sys.executable, str(SCRIPT)], cwd=self.root, capture_output=True, text=True, check=False)
        self.assertEqual(dirty.returncode, 1)
        self.assertEqual(dirty.stdout, "src/demo/domain/leak.py:1: imports/no-io: domain must not import I/O module requests\n")
        bad = subprocess.run([sys.executable, str(SCRIPT), "--config", "missing.toml"], cwd=self.root, capture_output=True, text=True, check=False)
        self.assertEqual(bad.returncode, 2)


if __name__ == "__main__":
    unittest.main()
