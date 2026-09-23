#!/usr/bin/env python3
"""Fail when a hexagonal Python package breaks its layout or import rules (standard library only).

Configuration: ``architecture.toml`` (see ../templates/architecture.toml) and/or flags; flags add.
Rules, reported by id (../SKILL.md explains each): layout/layer, layout/adapter-side,
imports/no-adapters, imports/domain-no-application, imports/no-io, imports/cross-package,
parse/syntax-error. Output: one line per violation, ``<path>:<line>: <rule>: <detail>`` (layout
violations carry no line). Exit codes: 0 clean, 1 violations found, 2 bad configuration.
"""

from __future__ import annotations

import argparse
import ast
import sys
import tomllib
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

DEFAULT_IO_MODULES: tuple[str, ...] = (
    # web frameworks and servers
    "fastapi", "flask", "starlette", "django", "uvicorn", "gunicorn",
    # HTTP clients
    "httpx", "requests", "aiohttp", "urllib3", "http.client", "urllib.request",
    # databases, caches, queues, cloud SDKs
    "sqlalchemy", "psycopg", "psycopg2", "asyncpg", "sqlite3", "duckdb", "pymongo",
    "redis", "pika", "kafka", "boto3", "botocore", "google.cloud", "google.auth", "firebase_admin",
    # data engines and template engines (their types leak into whatever imports them)
    "pandas", "pyarrow", "jinja2",
    # processes, sockets, mail
    "subprocess", "socket", "smtplib", "ftplib",
)
LAYERS = frozenset({"domain", "application", "adapters"})
ADAPTER_SIDES = frozenset({"inbound", "outbound"})
SKIP_DIRS = frozenset({"__pycache__", ".venv", "venv", "build", "node_modules"})
CONFIG_FILE = "architecture.toml"


class ConfigError(ValueError):
    """The configuration cannot be used; the process exits with code 2."""


@dataclass(frozen=True)
class Package:
    """One hexagonal package: ``<root>/<src>/<name>/{domain,application,adapters}``."""

    name: str
    src: str = "src"


@dataclass(frozen=True)
class Allow:
    """Modules under ``importer`` may import modules under ``imported`` (dotted prefixes)."""

    importer: str
    imported: str


@dataclass(frozen=True)
class Config:
    """Everything the checker needs; built from architecture.toml and CLI flags."""

    root: Path
    packages: tuple[Package, ...] = ()
    io_modules: tuple[str, ...] = ()
    io_extend: bool = True
    allows: tuple[Allow, ...] = ()

    def effective_io_modules(self) -> tuple[str, ...]:
        """Return the I/O blocklist: the built-in list plus extras, or extras alone."""
        return (*DEFAULT_IO_MODULES, *self.io_modules) if self.io_extend else self.io_modules


@dataclass(frozen=True)
class Violation:
    """One broken rule at one location. ``line`` is 0 for layout violations."""

    path: str
    line: int
    rule: str
    detail: str

    def render(self) -> str:
        """Format as ``path[:line]: rule: detail``."""
        where = f"{self.path}:{self.line}" if self.line else self.path
        return f"{where}: {self.rule}: {self.detail}"


@dataclass(frozen=True)
class ImportRef:
    """An imported dotted name and the line it appears on."""

    name: str
    line: int


def _table(value: object, where: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError(f"{where} must be a table")
    return value


def _list(value: object, where: str) -> list[Any]:
    if not isinstance(value, list):
        raise ConfigError(f"{where} must be an array (use [[{where}]] for each entry)")
    return value


def _string(table: dict[str, Any], key: str, where: str, default: str | None = None) -> str:
    value = table.get(key, default)
    if not isinstance(value, str) or not value:
        raise ConfigError(f"{where}.{key} must be a non-empty string")
    return value


def _reject_unknown(table: dict[str, Any], allowed: tuple[str, ...], where: str) -> None:
    unknown = sorted(set(table) - set(allowed))
    if unknown:
        raise ConfigError(f"{where}: unknown key(s): {', '.join(unknown)}")


def _package(item: object, index: int) -> Package:
    where = f"[[packages]] #{index + 1}"
    table = _table(item, where)
    _reject_unknown(table, ("name", "src"), where)
    name = _string(table, "name", where)
    if not name.isidentifier():
        raise ConfigError(f"{where}.name must be a Python identifier, got {name!r}")
    return Package(name=name, src=_string(table, "src", where, "src"))


def _allow(item: object, index: int) -> Allow:
    where = f"[[allow]] #{index + 1}"
    table = _table(item, where)
    _reject_unknown(table, ("importer", "imported"), where)
    return Allow(importer=_string(table, "importer", where), imported=_string(table, "imported", where))


def parse_config(data: dict[str, Any], root: Path) -> Config:
    """Turn a parsed TOML document into a Config without touching the filesystem."""
    _reject_unknown(data, ("packages", "io", "allow"), CONFIG_FILE)
    packages = tuple(_package(item, i) for i, item in enumerate(_list(data.get("packages", []), "packages")))
    io = _table(data.get("io", {}), "[io]")
    _reject_unknown(io, ("extend", "modules"), "[io]")
    extend = io.get("extend", True)
    if not isinstance(extend, bool):
        raise ConfigError("[io].extend must be true or false")
    modules = _list(io.get("modules", []), "[io].modules")
    if not all(isinstance(m, str) and m for m in modules):
        raise ConfigError("[io].modules must contain non-empty strings")
    allows = tuple(_allow(item, i) for i, item in enumerate(_list(data.get("allow", []), "allow")))
    return Config(root=root, packages=packages, io_modules=tuple(modules), io_extend=extend, allows=allows)


def load_config_file(path: Path, root: Path | None) -> Config:
    """Read and parse ``path``; package paths resolve against ``root`` or the file's directory."""
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigError(f"cannot read {path}: {exc.strerror or exc}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path}: {exc}") from exc
    return parse_config(data, (root or path.parent).resolve())


def validate_config(config: Config) -> None:
    """Reject configs the checker cannot act on (no packages, missing directories, typos)."""
    if not config.packages:
        raise ConfigError("no packages configured; add a [[packages]] entry or pass --package")
    names = [p.name for p in config.packages]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise ConfigError(f"duplicate package name(s): {', '.join(duplicates)}")
    for package in config.packages:
        package_dir = config.root / package.src / package.name
        if not package_dir.is_dir():
            raise ConfigError(f"package {package.name!r}: directory not found: {package_dir}")
    for rule in config.allows:
        for label, value in (("importer", rule.importer), ("imported", rule.imported)):
            if value.split(".", 1)[0] not in names:
                raise ConfigError(f"[[allow]] {label} {value!r} does not start with a configured package name")


def apply_cli(config: Config, args: argparse.Namespace) -> Config:
    """Add packages, I/O modules and allow rules given as flags."""
    packages = list(config.packages)
    for spec in args.package:
        name, _, src = spec.partition("=")
        packages.append(_package({"name": name, "src": src or "src"}, len(packages)))
    allows = list(config.allows)
    for spec in args.allow:
        importer, sep, imported = spec.partition("=")
        if not sep:
            raise ConfigError(f"--allow expects IMPORTER=IMPORTED, got {spec!r}")
        allows.append(_allow({"importer": importer, "imported": imported}, len(allows)))
    return replace(
        config,
        packages=tuple(packages),
        io_modules=(*config.io_modules, *args.io_module),
        io_extend=config.io_extend and not args.no_default_io,
        allows=tuple(allows),
    )


def config_from_args(args: argparse.Namespace) -> Config:
    """Resolve the config file (explicit, or ./architecture.toml) and merge the flags."""
    config_path: Path | None = args.config
    if config_path is None and not args.package and Path(CONFIG_FILE).is_file():
        config_path = Path(CONFIG_FILE)
    if config_path is not None:
        config = load_config_file(config_path, args.root)
    elif args.package:
        config = Config(root=(args.root or Path.cwd()).resolve())
    else:
        raise ConfigError(f"no {CONFIG_FILE} in the current directory; pass --config or --package")
    config = apply_cli(config, args)
    validate_config(config)
    return config


def python_files(package_dir: Path) -> list[Path]:
    """Return every ``.py`` file under ``package_dir``, skipping caches and virtualenvs."""
    return sorted(
        path
        for path in package_dir.rglob("*.py")
        if path.is_file() and not SKIP_DIRS.intersection(path.relative_to(package_dir).parts)
    )


def module_name(src_root: Path, path: Path) -> str:
    """Return the dotted module name of ``path`` relative to ``src_root``."""
    parts = list(path.relative_to(src_root).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def layer_of(module: str, package: str) -> str:
    """Return ``root`` for the package itself, else the first segment after the package name."""
    if module == package:
        return "root"
    return module[len(package) + 1 :].split(".", 1)[0]


def is_prefix(name: str, prefix: str) -> bool:
    """Return whether ``name`` is ``prefix`` or a submodule of it."""
    return name == prefix or name.startswith(f"{prefix}.")


def resolve_from(base: str, node: ast.ImportFrom) -> str | None:
    """Resolve ``from .x import y`` against ``base`` (the package the file sits in)."""
    if node.level == 0:
        return node.module
    parts = base.split(".") if base else []
    drop = node.level - 1
    if drop > len(parts):
        return node.module
    kept = parts[: len(parts) - drop]
    if node.module:
        return ".".join([*kept, node.module])
    return ".".join(kept) or None


def imported_names(path: Path, module: str) -> list[ImportRef]:
    """Return absolute dotted names imported anywhere in ``path`` (including inside functions).

    ``from a.b import c`` yields ``a.b`` and ``a.b.c`` so that ``from pkg import adapters``
    is caught as well as ``import pkg.adapters``. Raises SyntaxError for unparsable files.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    base = module if path.name == "__init__.py" else module.rpartition(".")[0]
    refs: list[ImportRef] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            refs.extend(ImportRef(alias.name, node.lineno) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            resolved = resolve_from(base, node)
            if resolved is None:
                continue
            refs.append(ImportRef(resolved, node.lineno))
            refs.extend(ImportRef(f"{resolved}.{alias.name}", node.lineno) for alias in node.names)
    return refs


def layout_violation(module: str, package: str) -> tuple[str, str] | None:
    """Return ``(rule, detail)`` when ``module`` sits outside the allowed tree."""
    layer = layer_of(module, package)
    if layer == "root":
        return None
    if layer not in LAYERS:
        return ("layout/layer", "place modules under domain/, application/ or adapters/")
    if layer == "adapters" and module != f"{package}.adapters":
        side = module[len(f"{package}.adapters.") :].split(".", 1)[0]
        if side not in ADAPTER_SIDES:
            return ("layout/adapter-side", "adapters must live under adapters/inbound/ or adapters/outbound/")
    return None


def import_violation(module: str, imported: str, package: str, config: Config) -> tuple[str, str] | None:
    """Return ``(rule, detail)`` when ``module`` may not import ``imported``."""
    layer = layer_of(module, package)
    if layer in {"domain", "application", "root"} and is_prefix(imported, f"{package}.adapters"):
        return ("imports/no-adapters", f"{layer} must not import adapters ({imported})")
    if layer == "domain" and is_prefix(imported, f"{package}.application"):
        return ("imports/domain-no-application", f"domain must not import application ({imported})")
    if layer in {"domain", "application"}:
        for io_module in config.effective_io_modules():
            if is_prefix(imported, io_module):
                return ("imports/no-io", f"{layer} must not import I/O module {imported}")
    return cross_package_violation(module, imported, package, config)


def cross_package_violation(module: str, imported: str, package: str, config: Config) -> tuple[str, str] | None:
    """Return a violation when ``imported`` belongs to another configured package without an allow rule."""
    owner = imported.split(".", 1)[0]
    if owner == package or owner not in {p.name for p in config.packages}:
        return None
    if any(is_prefix(module, a.importer) and is_prefix(imported, a.imported) for a in config.allows):
        return None
    return ("imports/cross-package", f"{package} must not import {imported} (no [[allow]] rule)")


def check_package(config: Config, package: Package) -> tuple[list[Violation], int]:
    """Check one package; return its violations and the number of modules scanned."""
    src_root = config.root / package.src
    files = python_files(src_root / package.name)
    violations: list[Violation] = []
    for path in files:
        relative = path.relative_to(config.root).as_posix()
        module = module_name(src_root, path)
        layout = layout_violation(module, package.name)
        if layout is not None:
            violations.append(Violation(relative, 0, *layout))
        try:
            refs = imported_names(path, module)
        except SyntaxError as exc:
            violations.append(Violation(relative, exc.lineno or 0, "parse/syntax-error", exc.msg))
            continue
        seen: set[tuple[int, str]] = set()
        for ref in refs:
            found = import_violation(module, ref.name, package.name, config)
            if found is not None and (ref.line, found[0]) not in seen:
                seen.add((ref.line, found[0]))
                violations.append(Violation(relative, ref.line, *found))
    return violations, len(files)


def check(config: Config) -> list[Violation]:
    """Return every violation across all configured packages, sorted by location."""
    violations: list[Violation] = []
    for package in config.packages:
        violations.extend(check_package(config, package)[0])
    return sorted(violations, key=lambda v: (v.path, v.line, v.rule))


def build_parser() -> argparse.ArgumentParser:
    """Define the command line."""
    parser = argparse.ArgumentParser(
        prog="check_architecture",
        description="Check hexagonal layout and import rules. Exit 0 clean, 1 violations, 2 bad config.",
    )
    parser.add_argument("--config", type=Path, help=f"config file (default: ./{CONFIG_FILE} when present)")
    parser.add_argument("--root", type=Path, help="directory package paths are relative to (default: the config file's directory)")
    parser.add_argument("--package", action="append", default=[], metavar="NAME[=SRC]", help="add a package; SRC defaults to src")
    parser.add_argument("--io-module", action="append", default=[], metavar="MODULE", help="add an I/O module prefix to the blocklist")
    parser.add_argument("--no-default-io", action="store_true", help="drop the built-in I/O blocklist; use only configured modules")
    parser.add_argument("--allow", action="append", default=[], metavar="IMPORTER=IMPORTED", help="permit a cross-package import (dotted prefixes)")
    parser.add_argument("--list-io", action="store_true", help="print the effective I/O blocklist and exit")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run the checker; print one line per violation and a summary on stderr."""
    args = build_parser().parse_args(argv)
    try:
        config = config_from_args(args)
    except ConfigError as exc:
        print(f"check_architecture: config error: {exc}", file=sys.stderr)
        return 2
    if args.list_io:
        print("\n".join(config.effective_io_modules()))
        return 0
    violations = check(config)
    for violation in violations:
        print(violation.render())
    modules = sum(len(python_files(config.root / p.src / p.name)) for p in config.packages)
    print(
        f"check_architecture: {len(config.packages)} package(s), {modules} module(s), {len(violations)} violation(s)",
        file=sys.stderr,
    )
    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
