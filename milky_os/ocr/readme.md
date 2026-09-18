# labelocr

Reads a photograph of a food label and returns the declared information as JSON.

British and German labels are both read.

Everything runs on the machine. No image leaves it. No API key is needed.

## Terms

A **cell** is one block of text as the OCR engine found it.
A **row** is the set of cells that share one printed line.
A **panel** is one nutrition table. A label may print two panels side by side.

## Install

```sh
./setup.sh
```

That builds `.venv` and draws the sample labels into `samples/`.

The engine is [RapidOCR](https://github.com/RapidAI/RapidOCR) on ONNX Runtime. Because
a) the models ship inside the wheel there is nothing to download at first run b) it needs
no system package so `apt` and `sudo` are not involved c) it runs on the CPU in about two
seconds per label.

## Use

```sh
.venv/bin/python -m labelocr samples/crisps.png
.venv/bin/python -m labelocr samples/*.png --json --out labels.json
.venv/bin/python -m labelocr photo.jpg --rows      # show the raw OCR rows
.venv/bin/python -m labelocr photo.jpg --enhance   # add contrast and sharpening
```

The report form:

```
crisps.png  [confidence 0.99]
  product           SALTED CRISPS
  net quantity      150 g
  best before       14/03/2027
  barcode           5012345678900
  allergens         cereals containing gluten, milk
  ingredients       Potatoes, Sunflower Oil (22%), Sea Salt, Milk Powder, Wheat Flour.
  nutrition (per 100 g   per 30g serving)
    energy_kj                2180 kJ       654 kJ
    energy_kcal             523 kcal      157 kcal
    fat                         32 g         9.6 g
    saturates                  2.8 g         0.8 g
    salt                       1.3 g        0.39 g
```

From Python:

```python
from labelocr import read_label

label = read_label("photo.jpg")
print(label.nutrient("salt").per_100)
print(label.to_dict())
```

## What it pulls out

| field | source on the label |
| --- | --- |
| `product_name` | the largest text in the top part of the image |
| `net_quantity` | a labelled net weight or a quantity standing on its own line |
| `ingredients` | the text after the ingredients heading up to the next section |
| `allergens` | the fourteen EU allergens matched in the ingredients or in an allergy advice line |
| `may_contain` | the same match against a may contain warning |
| `nutrition` | one entry per nutrient with a reading per column |
| `nutrition_basis` | per 100 g or per 100 ml |
| `serving` | the heading of the serving column |
| `best_before` `use_by` | the date beside the phrase or on the line below it |
| `storage` | the storage instruction and the line that follows it |
| `barcode` | 8 or 12 or 13 or 14 digits on their own line |
| `warnings` | what makes this reading doubtful |

The nutrition table covers the declared macronutrients. It also covers the minerals and
the vitamins an infant formula declares.

Energy becomes two entries. `energy_kj` and `energy_kcal` each carry their own reading.
Because a) a label declares both units b) one field cannot hold two units c) a caller
wanting kilocalories should not have to convert.

## How it works

1. `engine.prepare` straightens the image by its EXIF tag. Anything under 1280 pixels on
   the long side is upscaled.
2. `engine.read_cells` runs detection and recognition. Every box it returns is mapped
   back to the coordinates of the source image so a caller can crop the original.
3. `engine.group_rows` puts cells that overlap vertically into one row.
4. `parse.parse_rows` extracts the fields. It never sees the image so it can be tested
   against rows written by hand.

A nutrition row is split into one part per nutrient. That is what keeps two panels apart
when they share a printed line.

Position decides which column a reading belongs to only where the header declares both a
per 100 column and a serving column. Printed order settles every other table.

## Reading a damaged label

Contrast and sharpening are off by default. `--enhance` turns them on. A sweep over a
small German label lost five recognised words to them. They gain nothing on clean
artwork.

Two repairs run before any number is read.

`repair_numbers` turns a letter the engine mistook for a digit back into a digit. Only a
token holding a digit in front of a unit is touched.

`repair_units` fixes the units themselves. Small print turns `kJ` into `k]` often enough
to matter.

`218k] / 64kcaI` reads as 218 kJ and 64 kcal.

A nutrient name is matched against a term list in both languages. A name the engine
spelled wrongly is then matched by similarity. `Kohlenhvdrate` reads as carbohydrate.
Heavier damage than that is not recovered.

## Resolution

The reader warns when the median text box is under 16 pixels tall in the source image.
That is about nine pixels of print. Below it the digits are guesswork and a decimal point
is often lost. Photograph the panel so that it fills the frame. A panel 1000 pixels across
reads well. A panel 270 pixels across does not.

## Limits

The parser is written for the UK and EU declaration. A US Nutrition Facts panel gives
percentages of a daily value rather than a value per 100 g. Those rows are ignored.

A barcode is read only where its digits are printed. The bars themselves are not decoded.

A nutrition panel photographed on its own has no product name. The reader returns nothing
for that field rather than the largest row of the table.

Text printed around a curve is the common failure. Flatten the label towards the camera.

## Layout

```
labelocr/models.py    boxes cells rows quantities nutrients and the label
labelocr/engine.py    image preparation and the call into RapidOCR
labelocr/parse.py     field extraction from rows
labelocr/reader.py    read_label
labelocr/cli.py       the command line front end
tools/make_samples.py draws the sample labels
tests/                parser tests and end to end tests
```

## Tests

```sh
.venv/bin/python -m pytest tests/ -q
```

`tests/test_parse.py` runs against rows written by hand. It needs no engine.
`tests/test_samples.py` reads the drawn labels and asserts every field.
