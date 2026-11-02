// solc-js ships without type declarations; only the two functions compile.ts uses.
declare module "solc" {
  const solc: {
    compile(standardJsonInput: string): string;
    version(): string;
  };
  export default solc;
}
