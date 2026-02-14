type AuthErrorResponse = {
  message?: string;
  status?: number;
  code?: string;
  fieldErrors?: Record<string, string[]>;
};

export function handleAuthError(error: unknown): {
  error: string;
  fieldErrors: Record<string, string>;
} {
  const fallback = "Authentication failed. Please try again.";

  if (!error) return { error: fallback, fieldErrors: {} };
  if (error instanceof Error) return { error: error.message || fallback, fieldErrors: {} };

  const raw = error as AuthErrorResponse;
  const fieldErrors: Record<string, string> = {};
  if (raw.fieldErrors) {
    for (const [key, value] of Object.entries(raw.fieldErrors)) {
      if (value?.[0]) fieldErrors[key] = value[0];
    }
  }

  return {
    error: raw.message || fallback,
    fieldErrors,
  };
}
