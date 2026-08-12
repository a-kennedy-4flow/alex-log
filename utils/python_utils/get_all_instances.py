import os
import json
import yaml
from pathlib import Path
from collections import defaultdict


def _resolve_path(obj, keys):
    """Walk dot-separated keys into a nested dict/list structure."""
    for key in keys:
        if isinstance(obj, dict):
            if key not in obj:
                return None
            obj = obj[key]
        elif isinstance(obj, list):
            results = [_resolve_path(item, [key]) for item in obj if isinstance(item, dict)]
            results = [r for r in results if r is not None]
            return results if results else None
        else:
            return None
    return obj


def get_all_instances(directory, json_path):
    """
    Recursively scan *directory* for YAML files.
    Groups files by the shape/value of the object at *json_path*.
    Returns a list of dicts, each with:
      - "value": the actual object found
      - "count": number of files sharing that exact value
      - "files": list of those file paths
    """
    keys = json_path.split(".")
    # canonical JSON string -> {"value": ..., "files": [...]}
    groups = defaultdict(lambda: {"value": None, "files": []})

    for root, _, files in os.walk(directory):
        for filename in sorted(files):
            if not (filename.endswith(".yml") or filename.endswith(".yaml")):
                continue
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, "r") as f:
                    data = yaml.safe_load(f)
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            value = _resolve_path(data, keys)
            if value is None:
                continue
            # Use sorted, canonical JSON as the grouping key
            canonical = json.dumps(value, sort_keys=True)
            groups[canonical]["value"] = value
            groups[canonical]["files"].append(filepath)

    return [
        {"value": g["value"], "count": len(g["files"]), "files": g["files"]}
        for g in groups.values()
    ]

path = "monitoring.load"
result = get_all_instances("/home/alex/repos/devops-ansible-playbooks/", path)
print(f"instances of {path}, total different objects: {len(result)}\n")
for group in result:
    print(f"count: {group['count']}, files: {group['files']}")
    print(f"value: {group['value']}\n")

path = "monitoring.disks"
result = get_all_instances("/home/alex/repos/devops-ansible-playbooks/", path)
print(f"instances of {path}, total different objects: {len(result)}\n")
for group in result:
    print(f"count: {group['count']}, files: {group['files']}")
    print(f"value: {group['value']}\n")

path = "monitoring.swap_mem"
result = get_all_instances("/home/alex/repos/devops-ansible-playbooks/", path)
print(f"instances of {path}, total different objects: {len(result)}\n")
for group in result:
    print(f"count: {group['count']}, files: {group['files']}")
    print(f"value: {group['value']}\n")
# def get_all_instances(directory, json_path):
#     """
#     Recursively scan *directory* for YAML files.
#     Returns a dict with:
#       - "count": total number of files where *json_path* is present
#       - "files": list of those file paths
#     """
#     keys = json_path.split(".")
#     matched_files = []

#     for root, _, files in os.walk(directory):
#         for filename in sorted(files):
#             if not (filename.endswith(".yml") or filename.endswith(".yaml")):
#                 continue
#             filepath = os.path.join(root, filename)
#             try:
#                 with open(filepath, "r") as f:
#                     data = yaml.safe_load(f)
#             except Exception:
#                 continue
#             if not isinstance(data, dict):
#                 continue
#             if _resolve_path(data, keys) is not None:
#                 matched_files.append(filepath)

#     return {"count": len(matched_files), "files": matched_files}


# result = get_all_instances("/home/alex/repos/devops-ansible-playbooks/", "monitoring.disks")
# print(result)