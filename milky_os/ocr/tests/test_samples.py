"""End to end tests over the drawn samples. These run the OCR engine."""

from pathlib import Path

import pytest

from labelocr import read_label

pytest.importorskip("rapidocr_onnxruntime", reason="the OCR engine is not installed")


@pytest.fixture(scope="module")
def crisps(samples):
    return read_label(samples / "crisps.png")


@pytest.fixture(scope="module")
def milk(samples):
    return read_label(samples / "milk.png")


@pytest.fixture(scope="module")
def cereal(samples):
    return read_label(samples / "cereal.png")


def test_reads_the_product_name(crisps, milk, cereal):
    assert crisps.product_name == "SALTED CRISPS"
    assert milk.product_name == "FRESH WHOLE MILK"
    # Spacing is the engine's business. The field is what matters here.
    assert cereal.product_name.replace(" ", "") == "OATCLUSTERS"


def test_reads_the_net_quantity(crisps, milk, cereal):
    assert (crisps.net_quantity.value, crisps.net_quantity.unit) == (150.0, "g")
    assert (milk.net_quantity.value, milk.net_quantity.unit) == (1.0, "l")
    assert (cereal.net_quantity.value, cereal.net_quantity.unit) == (500.0, "g")


def test_reads_both_energy_units(crisps, milk):
    assert crisps.nutrient("energy_kj").per_100.value == 2180
    assert crisps.nutrient("energy_kcal").per_100.value == 523
    assert milk.nutrient("energy_kj").per_100.value == 268
    assert milk.nutrient("energy_kcal").per_100.value == 64
    assert crisps.nutrient("energy_kj").per_serving.value == 654
    assert crisps.nutrient("energy_kcal").per_serving.value == 157


def test_reads_the_serving_column(crisps):
    assert crisps.nutrient("fat").per_100.value == 32.0
    assert crisps.nutrient("fat").per_serving.value == 9.6
    assert crisps.nutrient("salt").per_serving.value == 0.39
    assert "30g" in crisps.serving


def test_reads_every_declared_nutrient(crisps):
    names = [nutrient.name for nutrient in crisps.nutrition]
    assert names == [
        "energy_kj",
        "energy_kcal",
        "fat",
        "saturates",
        "carbohydrate",
        "sugars",
        "fibre",
        "protein",
        "salt",
    ]


def test_reads_the_basis_of_the_table(milk, cereal):
    assert milk.nutrition_basis == "per 100 ml"
    assert cereal.nutrition_basis == "per 100 g"


def test_reads_the_ingredients(cereal):
    assert cereal.ingredients.startswith("Wholegrain Oats (68%)")
    assert cereal.ingredients.endswith("Barley Malt Extract.")


def test_reads_the_allergens(crisps, cereal):
    assert crisps.allergens == ["cereals containing gluten", "milk"]
    assert cereal.allergens == ["cereals containing gluten", "nuts"]
    assert cereal.may_contain == ["peanuts", "sesame"]


def test_reads_the_dates(crisps, milk, cereal):
    assert crisps.best_before == "14/03/2027"
    assert milk.use_by == "21 SEP 2026"
    assert cereal.best_before == "MAR 2027"


def test_reads_the_storage_instruction(milk):
    assert milk.storage.startswith("Keep refrigerated")
    assert "3 days" in milk.storage


def test_reads_the_barcode(crisps):
    assert crisps.barcode == "5012345678900"


def test_every_row_is_recognised_with_confidence(crisps):
    assert crisps.confidence > 0.9


def test_reads_a_rotated_and_noisy_photograph(samples, tmp_path):
    """A real photograph is smaller darker and never square on."""
    import numpy as np
    from PIL import Image

    source = Image.open(samples / "crisps.png")
    image = source.rotate(-1.2, expand=True, fillcolor=(252, 252, 250), resample=Image.BICUBIC)
    image = image.resize((int(image.width * 0.62), int(image.height * 0.62)), Image.LANCZOS)
    pixels = np.asarray(image).astype(np.int16)
    noise = np.random.default_rng(0).normal(0, 7, pixels.shape)
    pixels = (pixels * 0.82 + noise).clip(0, 255).astype(np.uint8)
    path = tmp_path / "photo.jpg"
    Image.fromarray(pixels).save(path, quality=72)

    label = read_label(path)
    assert label.product_name == "SALTED CRISPS"
    assert label.nutrient("salt").per_100.value == 1.30
    assert label.nutrient("energy_kcal").per_100.value == 523
    assert label.barcode == "5012345678900"


REAL = Path(__file__).resolve().parent.parent / "Bebivita-pre.png"


@pytest.mark.skipif(not REAL.exists(), reason="the real label is not in the working directory")
def test_reads_a_real_german_panel():
    """The panel is 268 pixels wide so the readings are wrong. Saying so is the point."""
    label = read_label(REAL)
    assert label.warnings and "pixels tall" in label.warnings[0]
    assert label.nutrition_basis == "per 100 ml"
    assert "milk" in label.allergens
    assert label.ingredients.lower().startswith("m")
    assert label.product_name is None
