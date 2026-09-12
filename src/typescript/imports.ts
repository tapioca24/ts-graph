import ts from "typescript";

/** Retain AST locations so NodeNext can choose import/require export conditions. */
export function collectImports(source: ts.SourceFile): ts.StringLiteralLike[] {
  const imports: ts.StringLiteralLike[] = [];
  const add = (node: ts.Node | undefined) => {
    if (node && ts.isStringLiteral(node)) imports.push(node);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      add(node.arguments[0]);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      add(node.moduleReference.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}
