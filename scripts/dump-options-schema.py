"""Dumps an apworld's player options to a JSON schema that the launcher's YAML editor renders.

Only the world's options module is loaded, on top of an Archipelago checkout, so the rest of the
world and its dependencies are not needed, and options.py must not import any of it.

Usage: python dump-options-schema.py --archipelago <checkout> --world <world dir> --output <json>
"""

import argparse
import dataclasses
import importlib.util
import inspect
import json
import sys
import typing
from pathlib import Path


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def to_jsonable(value):
    if isinstance(value, (set, frozenset, tuple)):
        return sorted(value, key=str) if isinstance(value, (set, frozenset)) else list(value)
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    return value


def describe(key: str, option, Options) -> dict:
    entry = {
        "key": key,
        "displayName": getattr(option, "display_name", key),
        "description": inspect.cleandoc(option.__doc__) if option.__doc__ else "",
        "richText": bool(option.rich_text_doc),
        "supportsWeighting": bool(option.supports_weighting),
    }
    default = option.default

    if issubclass(option, Options.Toggle):
        entry["type"] = "toggle"
        entry["default"] = bool(default)
        entry["choices"] = [{"value": "false", "label": option.get_option_name(0)}, {"value": "true", "label": option.get_option_name(1)}]
    elif issubclass(option, Options.Choice):
        entry["type"] = "textChoice" if issubclass(option, Options.TextChoice) else "choice"
        entry["default"] = option.name_lookup.get(default, default) if isinstance(default, int) else default
        entry["choices"] = [{"value": name, "label": option.get_option_name(value)} for value, name in option.name_lookup.items()]
        if option.aliases:
            entry["aliases"] = {alias: option.name_lookup[value] for alias, value in option.aliases.items()}
    elif issubclass(option, Options.Range):
        entry["type"] = "namedRange" if issubclass(option, Options.NamedRange) else "range"
        entry["default"] = default
        entry["min"] = option.range_start
        entry["max"] = option.range_end
        special = getattr(option, "special_range_names", {})
        if special:
            entry["specialValues"] = [{"name": name, "value": value} for name, value in special.items()]
    elif issubclass(option, Options.FreeText):
        entry["type"] = "freeText"
        entry["default"] = default
    elif issubclass(option, Options.OptionCounter):
        entry["type"] = "counter"
        entry["default"] = to_jsonable(default)
    elif issubclass(option, Options.OptionDict):
        entry["type"] = "dict"
        entry["default"] = to_jsonable(default)
    elif issubclass(option, Options.OptionSet):
        entry["type"] = "set"
        entry["default"] = to_jsonable(default)
    elif issubclass(option, Options.OptionList):
        entry["type"] = "list"
        entry["default"] = to_jsonable(default)
    else:
        # Plando options and anything exotic: edited as raw YAML
        entry["type"] = "other"
        entry["default"] = to_jsonable(default) if isinstance(default, (str, int, float, bool, list, dict, set, tuple)) else []

    valid_keys = getattr(option, "valid_keys", None)
    if valid_keys:
        entry["validKeys"] = sorted(valid_keys)
    return entry


def build_groups(module, type_hints: dict, Options) -> list:
    """Mirrors WebWorldRegister and Options.get_option_groups: the world's groups in order, ungrouped options
    first under "Game Options", and the item & location options last."""
    option_to_key = {option: key for key, option in type_hints.items()}
    item_and_loc = Options.item_and_loc_options

    groups = [(group.name, list(group.options), group.start_collapsed) for group in getattr(module, "option_groups", [])]
    item_group = next((group for group in groups if group[0] == "Item & Location Options"), None)
    if item_group:
        item_group[1].extend(item_and_loc)
    else:
        groups.append(("Item & Location Options", list(item_and_loc), True))

    if not any(name == "Game Options" for name, _, _ in groups):
        grouped = {option for _, options, _ in groups for option in options}
        ungrouped = [option for option in option_to_key if option not in grouped]
        if ungrouped:
            groups.insert(0, ("Game Options", ungrouped, False))

    result = []
    for name, options, collapsed in groups:
        visible = [
            describe(option_to_key[option], option, Options)
            for option in options
            if option in option_to_key and Options.Visibility.template in option.visibility
        ]
        if visible:
            result.append({"name": name, "collapsed": collapsed, "options": visible})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archipelago", required=True, type=Path, help="Archipelago checkout")
    parser.add_argument("--world", required=True, type=Path, help="world directory holding options.py and archipelago.json")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    sys.path.insert(0, str(args.archipelago.resolve()))
    import Options  # noqa: E402  (needs the checkout on the path)
    from Utils import __version__ as archipelago_version  # noqa: E402

    manifest = json.loads((args.world / "archipelago.json").read_text(encoding="utf-8"))
    module = load_module("apworld_options", args.world / "options.py")

    dataclass_types = [
        value
        for value in vars(module).values()
        if inspect.isclass(value) and issubclass(value, Options.PerGameCommonOptions) and value is not Options.PerGameCommonOptions
    ]
    assert len(dataclass_types) == 1, f"expected one options dataclass, found {dataclass_types}"
    options_type = dataclass_types[0]
    assert dataclasses.is_dataclass(options_type)
    type_hints = typing.get_type_hints(options_type)

    schema = {
        "game": manifest["game"],
        "worldVersion": manifest.get("world_version", "0.0.0"),
        "minimumArchipelagoVersion": manifest.get("minimum_ap_version", archipelago_version),
        "archipelagoVersion": archipelago_version,
        "groups": build_groups(module, type_hints, Options),
        "presets": to_jsonable(getattr(module, "option_presets", {})),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {sum(len(g['options']) for g in schema['groups'])} options for {schema['game']} {schema['worldVersion']} to {args.output}")


if __name__ == "__main__":
    main()
