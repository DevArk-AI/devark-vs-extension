export interface PromptValidationResult {
  valid: boolean;
  sanitized?: string;
  errors?: string[];
  warnings?: string[];
}

export class PromptValidator {
  private readonly MAX_LENGTH = 10000;
  private readonly MIN_LENGTH = 3;

  private readonly SUSPICIOUS_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now/i,
    /system\s*prompt/i,
  ];

  validate(prompt: string): PromptValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!prompt?.trim()) {
      errors.push('Prompt cannot be empty');
      return { valid: false, errors };
    }

    if (prompt.length < this.MIN_LENGTH) {
      errors.push(`Prompt must be at least ${this.MIN_LENGTH} characters`);
    }

    if (prompt.length > this.MAX_LENGTH) {
      errors.push(`Prompt exceeds maximum length of ${this.MAX_LENGTH} characters`);
    }

    for (const pattern of this.SUSPICIOUS_PATTERNS) {
      if (pattern.test(prompt)) {
        warnings.push('Prompt contains suspicious content');
        break;
      }
    }

    return {
      valid: errors.length === 0,
      sanitized: this.sanitize(prompt),
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  private sanitize(prompt: string): string {
    return prompt.replace(/\0/g, '').replace(/\s+/g, ' ').trim().substring(0, this.MAX_LENGTH);
  }
}
