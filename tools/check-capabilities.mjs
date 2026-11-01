// Contract parity check between src/settings.ts and capabilities.json:
//   1. every formatting card is an `objects` entry and vice versa;
//   2. every slice in a card (including slices nested in its groups and composite slices) is a
//      property of that object, and every declared property has a slice;
//   3. every data role is referenced by dataViewMappings, and every role referenced there exists.
// settings.ts is parsed with the TypeScript compiler API, so formatting changes don't break it.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const settingsPath = join(root, "src", "settings.ts");
const capabilitiesPath = join(root, "capabilities.json");

const cardBases = new Set(["Card", "CompositeCard", "SimpleCard", "FormattingSettingsCard"]);
// Composite slices are containers in the pane; only their sub-slices are stored properties.
const compositeSlices = new Set(["FontControl", "MarginPadding"]);

function lastName(expression) {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    return undefined;
}

function stringProperty(objectLiteral, key) {
    for (const property of objectLiteral.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText() === key && ts.isStringLiteralLike(property.initializer)) {
            return property.initializer.text;
        }
    }
    return undefined;
}

function describeClasses(sourceFile) {
    const classes = new Map();
    for (const statement of sourceFile.statements) {
        if (!ts.isClassDeclaration(statement) || !statement.name) continue;
        const info = { base: undefined, name: undefined, slices: new Set(), children: new Set() };
        const heritage = statement.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
        info.base = heritage ? lastName(heritage.types[0].expression) : undefined;

        for (const member of statement.members) {
            if (ts.isPropertyDeclaration(member) && member.name.getText() === "name" && member.initializer && ts.isStringLiteralLike(member.initializer)) {
                info.name = member.initializer.text;
            }
        }

        info.newExpressions = [];
        const visit = (node) => {
            if (ts.isNewExpression(node)) info.newExpressions.push(node);
            ts.forEachChild(node, visit);
        };
        statement.members.forEach(visit);
        classes.set(statement.name.text, info);
    }

    // A `new X()` of a class declared in this file is a child group/card; any other `new X({ name })`
    // is a formatting slice, however the slice class was imported or aliased.
    for (const info of classes.values()) {
        for (const node of info.newExpressions) {
            const constructed = lastName(node.expression);
            const argument = node.arguments?.[0];
            if (constructed && classes.has(constructed)) {
                info.children.add(constructed);
            } else if (argument && ts.isObjectLiteralExpression(argument) && !compositeSlices.has(constructed)) {
                const sliceName = stringProperty(argument, "name");
                if (sliceName) info.slices.add(sliceName);
            }
        }
    }
    return classes;
}

function collectSlices(classes, className, seen = new Set()) {
    const info = classes.get(className);
    if (!info || seen.has(className)) return new Set();
    seen.add(className);
    const slices = new Set(info.slices);
    for (const child of info.children) {
        if (classes.has(child) && !cardBases.has(classes.get(child).base)) {
            for (const slice of collectSlices(classes, child, seen)) slices.add(slice);
        }
    }
    return slices;
}

function collectRoleReferences(node, references = new Set()) {
    if (Array.isArray(node)) {
        node.forEach((item) => collectRoleReferences(item, references));
    } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            if ((key === "in" || key === "to") && typeof value === "string") {
                references.add(value);
            } else if (key === "conditions" && Array.isArray(value)) {
                value.forEach((condition) => Object.keys(condition).forEach((role) => references.add(role)));
            } else {
                collectRoleReferences(value, references);
            }
        }
    }
    return references;
}

function difference(a, b) {
    return [...a].filter((item) => !b.has(item)).sort();
}

async function main() {
    const source = await readFile(settingsPath, "utf8");
    const capabilities = JSON.parse(await readFile(capabilitiesPath, "utf8"));
    const sourceFile = ts.createSourceFile(settingsPath, source, ts.ScriptTarget.Latest, true);
    const classes = describeClasses(sourceFile);
    const errors = [];

    const cards = new Map();
    for (const [className, info] of classes) {
        if (!cardBases.has(info.base)) continue;
        if (!info.name) {
            errors.push(`Card class ${className} has no string literal "name" property`);
            continue;
        }
        cards.set(info.name, collectSlices(classes, className));
    }

    const objects = capabilities.objects ?? {};
    const objectNames = new Set(Object.keys(objects));
    const cardNames = new Set(cards.keys());
    for (const name of difference(cardNames, objectNames)) errors.push(`Card "${name}" is missing from capabilities.json objects`);
    for (const name of difference(objectNames, cardNames)) errors.push(`capabilities.json object "${name}" has no formatting card in settings.ts`);

    for (const [cardName, slices] of cards) {
        if (!objects[cardName]) continue;
        const properties = new Set(Object.keys(objects[cardName].properties ?? {}));
        for (const slice of difference(slices, properties)) errors.push(`Slice "${cardName}.${slice}" is not declared in capabilities.json`);
        for (const property of difference(properties, slices)) errors.push(`capabilities.json property "${cardName}.${property}" has no slice in settings.ts`);
    }

    const roles = new Set((capabilities.dataRoles ?? []).map((role) => role.name));
    const referenced = collectRoleReferences(capabilities.dataViewMappings ?? []);
    for (const role of difference(roles, referenced)) errors.push(`Data role "${role}" is not mapped in dataViewMappings`);
    for (const role of difference(referenced, roles)) errors.push(`dataViewMappings references unknown data role "${role}"`);

    if (errors.length > 0) {
        for (const error of errors) console.error(`FAIL ${error}`);
        console.error(`\nCapabilities check: ${errors.length} problem(s)`);
        process.exitCode = 1;
        return;
    }
    const propertyCount = [...cards.values()].reduce((sum, slices) => sum + slices.size, 0);
    console.log(`Capabilities check: ${cards.size} card(s), ${propertyCount} propert${propertyCount === 1 ? "y" : "ies"}, ${roles.size} data role(s) in parity`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
