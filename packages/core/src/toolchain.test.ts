// Confirms eslint/jest/ts-jest are wired up and TypeScript compiles under jest.
// Delete once packages/core has real implementations to test.

interface Sample {
  value: number;
  label?: string;
}

describe('toolchain', () => {
  it('compiles and runs TypeScript', () => {
    const sample: Sample = { value: 2 };
    expect(sample.value).toBe(2);
    expect(sample.label).toBeUndefined();
  });
});
