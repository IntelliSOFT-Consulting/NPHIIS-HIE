"""Tests for build_questionnaires.py. Run: python3 -m unittest discover forms/tools"""
import csv
import json
import unittest
from pathlib import Path

from build_questionnaires import all_items, build_forms

ROOT = Path(__file__).resolve().parents[2]
VHF = ROOT / "forms" / "vhf"
FIELDS = VHF / "fields.csv"
OPTIONS = VHF / "options.csv"
PLATFORM = VHF / "platform" / "afp-case.json"


def load_forms():
    return build_forms(FIELDS, OPTIONS, PLATFORM)


def spec_rows():
    with open(FIELDS, newline="") as f:
        return list(csv.DictReader(f))


def option_codes():
    codes = {}
    with open(OPTIONS, newline="") as f:
        for r in csv.DictReader(f):
            codes.setdefault(r["value_set"], []).append(r["code"])
    return codes


def by_link_id(q):
    return {i["linkId"]: i for i in all_items(q)}


def ext(item, suffix):
    return [e for e in item.get("extension", []) if e["url"].endswith(suffix)]


class BuildFormsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.forms = load_forms()

    def test_one_questionnaire_per_spec_form(self):
        self.assertEqual(
            sorted(self.forms),
            sorted({r["form"] for r in spec_rows()}),
        )

    def test_questionnaire_identity(self):
        for form_id, q in self.forms.items():
            self.assertEqual(q["resourceType"], "Questionnaire")
            self.assertEqual(q["id"], form_id)
            self.assertEqual(q["url"], f"http://nphiis.health.go.ke/Questionnaire/{form_id}")
            self.assertEqual(q["status"], "active")

    def test_every_spec_row_is_emitted_once(self):
        for r in spec_rows():
            ids = [i["linkId"] for i in all_items(self.forms[r["form"]])]
            self.assertEqual(ids.count(r["link_id"]), 1, (r["form"], r["link_id"]))

    def test_link_ids_unique_within_each_form(self):
        for form_id, q in self.forms.items():
            ids = [i["linkId"] for i in all_items(q)]
            self.assertEqual(len(ids), len(set(ids)), form_id)

    def test_afp_follow_up_trigger_link_id_never_used(self):
        for q in self.forms.values():
            self.assertNotIn("502488184403", by_link_id(q))

    def test_platform_link_ids_present_in_case_form(self):
        ids = by_link_id(self.forms["vhf-case"])
        for lid in ["151479012557", "992818778559", "294367770999", "a4-county",
                    "a3-sub-county", "a2-ward", "929966324957", "257830485990"]:
            self.assertIn(lid, ids)

    def test_location_pickers_copied_from_platform(self):
        county = by_link_id(self.forms["vhf-case"])["a3-sub-county"]
        self.assertEqual(county["type"], "reference")
        self.assertIn("{{%patientCountyName}}", json.dumps(ext(county, "answerExpression")))

    def test_platform_variables_copied_when_platform_items_used(self):
        names = [e["valueExpression"]["name"] for e in ext(self.forms["vhf-case"], "/variable")]
        self.assertIn("patientCountyName", names)
        self.assertIn("assignedRole", names)

    def test_choice_options_match_options_csv(self):
        codes = option_codes()
        for r in spec_rows():
            if r["type"] != "choice":
                continue
            item = by_link_id(self.forms[r["form"]])[r["link_id"]]
            got = [o["valueCoding"]["code"] for o in item["answerOption"]]
            self.assertEqual(got, codes[r["value_set"]], r["link_id"])

    def test_repeating_choice_uses_check_boxes(self):
        item = by_link_id(self.forms["vhf-case"])["symptoms"]
        self.assertTrue(item["repeats"])
        self.assertIn("check-box", json.dumps(ext(item, "questionnaire-itemControl")))

    def test_enable_when_targets_exist_with_valid_codes(self):
        codes = option_codes()
        rows = {(r["form"], r["link_id"]): r for r in spec_rows()}
        for form_id, q in self.forms.items():
            ids = by_link_id(q)
            for item in all_items(q):
                for ew in item.get("enableWhen", []):
                    self.assertIn(ew["question"], ids, item["linkId"])
                    target = rows.get((form_id, ew["question"]))
                    if target and target["type"] == "choice":
                        self.assertIn(ew["answerCoding"]["code"], codes[target["value_set"]])

    def test_any_of_conditions_set_enable_behavior(self):
        item = by_link_id(self.forms["vhf-case"])["ppe_items_worn"]
        self.assertEqual(len(item["enableWhen"]), 2)
        self.assertEqual(item["enableBehavior"], "any")

    def test_future_dates_blocked(self):
        onset = by_link_id(self.forms["vhf-case"])["728034137219"]
        self.assertIn("today()", json.dumps(ext(onset, "maxValue")))

    def test_integer_ranges(self):
        day = by_link_id(self.forms["vhf-contact-follow-up"])["day_of_follow_up"]
        self.assertEqual(ext(day, "minValue")[0]["valueInteger"], 0)
        self.assertEqual(ext(day, "maxValue")[0]["valueInteger"], 21)

    def test_after_constraint_compares_dates(self):
        arrival = by_link_id(self.forms["vhf-case"])["travel_arrival_date"]
        expr = ext(arrival, "questionnaire-constraint")[0]
        self.assertIn("date_of_departure", json.dumps(expr))

    def test_constraint_keys_are_valid_fhir_ids(self):
        import re
        for q in self.forms.values():
            for item in all_items(q):
                for c in ext(item, "questionnaire-constraint"):
                    key = next(e["valueId"] for e in c["extension"] if e["url"] == "key")
                    self.assertRegex(key, r"^[A-Za-z0-9\-.]{1,64}$")

    def test_hidden_items_flagged(self):
        item = by_link_id(self.forms["vhf-lab-results"])["automatically_updated"]
        self.assertTrue(ext(item, "questionnaire-hidden")[0]["valueBoolean"])

    def test_required_flags_follow_spec(self):
        for r in spec_rows():
            if r["type"] == "platform_block":
                continue
            item = by_link_id(self.forms[r["form"]])[r["link_id"]]
            self.assertEqual(item.get("required", False), r["required"] == "yes", r["link_id"])

    def test_committed_output_is_up_to_date(self):
        for form_id, q in self.forms.items():
            committed = json.loads((VHF / "out" / f"{form_id}.json").read_text())
            self.assertEqual(committed, q, f"{form_id}.json is stale; rerun the generator")


if __name__ == "__main__":
    unittest.main()
