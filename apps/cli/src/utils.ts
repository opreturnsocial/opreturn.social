export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export async function handleError(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    process.exit(0);
  } catch (error) {
    const cause =
      error instanceof Error && error.cause != null
        ? error.cause instanceof Error
          ? error.cause.message
          : String(error.cause)
        : undefined;
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
          ...(cause ? { cause } : { cause: "unknown" }),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}
