# Rule L1 — Technical nouns and technical verbs for this project

*Project rule — not part of ASD-STE100. It sets the company glossary that rule 1.5 (technical nouns), rule 1.8 (approved technical nouns), and rule 1.12 (technical verbs) require each subject field to supply.*

> Use only simple Java and programming terms as technical nouns and technical verbs. A term is simple when it is the shortest, most common name for the thing, and a reader who knows Java recognizes it without a glossary.

The dictionary (part 2) is unchanged. It still governs every general English word, part of speech, approved meaning, and verb form. This rule governs only the domain terms that the dictionary deliberately leaves out, because rule 1.12 states that the dictionary does not include technical verbs and rule 1.5 states that each subject field uses different technical nouns.

A term outside the categories that follow is not a technical noun or a technical verb for this project. Replace it with an approved word from the dictionary, or with a term from the categories.

## Technical noun categories

1. Language constructs

```text
annotation, class, constructor, enum, field, interface, lambda, method,
package, parameter, record, type parameter
```

2. Types and values

```text
array, boolean, integer, list, map, null, number, object, reference, set,
string, value
```

3. Source and build artifacts

```text
build file, classpath, dependency, JAR file, module, repository, source
file, test file, version
```

4. Runtime

```text
class loader, garbage collector, heap, JVM, process, stack, thread, thread
pool
```

5. Errors and diagnostics

```text
error, exception, log file, log message, stack trace, test failure, warning
```

6. Tools and environment

```text
compiler, debugger, formatter, IDE, linter, profiler, test runner
```

7. Data and interfaces

```text
API, connection, database, endpoint, field name, query, request, response,
schema, table
```

## Technical verb categories

1. Build and run

```text
build, compile, deploy, run, start, stop
```

2. Code operations

```text
call, catch, extend, implement, initialize, instantiate, override, return,
throw
```

3. Data operations

```text
parse, read, serialize, validate, write
```

4. Maintenance

```text
commit, debug, format, log, merge, profile, refactor, test
```

## How to keep a term simple

Rule 1.9 tells you to select a technical noun that is short and easy to understand. For programming terms, this means:

- Use the full word, not an abbreviation, unless the abbreviation is the standard name of the thing. `JVM`, `API`, and `JAR file` are standard; `impl`, `cfg`, `ctx`, and `obj` are not.
- Use one term for one concept, as rule 1.11 requires. Select `method` or `function`, not both.
- Do not use slang or in-house names, as rule 1.10 requires. `POJO`, `bean magic`, and `the usual suspects file` are not technical nouns.
- Do not invent a term for something the dictionary already has an approved word for.

```text
Non-STE:      Instantiate the impl and shove it in the ctx.
    STE:      Create the object. Then put the object in the context.
```

## Rules that constrain these terms

Programming terms break two STE rules more often than other technical terms. Obey these rules when you select a term.

Rule 1.7 tells you not to use a technical noun as a verb, and rule 1.13 tells you not to use a technical verb as a noun. Many programming words are both. The categories above put each word on one side only. Use the noun form from the noun categories, and the verb form from the verb categories.

```text
Non-STE:      Read the log to find the error. Then commit.
    STE:      Read the log file to find the error. Then commit the change.
```

Two words are nouns only in this project, although programmers use them as verbs. `package` is a language construct, and `query` is an item of data. Use a verb from the verb categories for the action.

```text
Non-STE:      Package the module, then query the database.
    STE:      Build the JAR file for the module. Then read the database.
```

Rule 2.1 tells you to write multi-word nouns of no more than three words. Type names and configuration names are frequently longer. Write the name in full one time, then use a shorter form or prepositions, as rule 2.2 permits.

```text
Non-STE:      The connection pool factory configuration bean failed.  (5 words)
    STE:      The configuration bean for the connection pool failed.
                                                    (2 words and 3 words)
```

Rule 1.14 tells you to use American English spelling. Use `initialize` and `serialize`, not `initialise` and `serialise`. Keep the spelling of an identifier that appears in the code exactly as the code spells it, even when that spelling is not American English.

## Terms that the standard already approves

Some terms in the categories above are also in the category lists of rule 1.5 and rule 1.12. You do not need this rule to use them.

```text
Nouns:      class, database, field, interface, process, reference, table,
            thread, warning
Verbs:      debug, format, validate
```

Be careful with `interface`, `field`, and `class`. Rule 1.5 lists them in category 19, computer science and information and communication technology, where they name a user interface, a field in a form or a record, and a class of items. In this project they name the Java constructs. Rule 1.11 tells you not to use different technical nouns for the same item; the same problem in reverse is one technical noun for two items. Where a text can be read both ways, write which one you mean.

```text
Non-STE:      Add a field to the interface.
    STE:      Add a field to the Java interface.
```

💡 The categories give examples, not a full list. Rule 1.5 says the same about its own categories. When you must add a term, put it in one of the categories above and add it to the project glossary in `ste/priv/technical_terms.json`. If a term fits no category, that is a signal to use an approved word from the dictionary instead.
