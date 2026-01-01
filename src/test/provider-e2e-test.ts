/**
 * Provider End-to-End Testing Utility
 *
 * Tests all configured LLM providers including:
 * - Connection testing
 * - Prompt scoring functionality
 * - Prompt enhancement functionality
 * - Error handling and edge cases
 */

import { LLMManager } from '../llm/llm-manager';
import { PromptScorer } from '../copilot/prompt-scorer';
import { PromptEnhancer } from '../copilot/prompt-enhancer';
import type { LLMProviderType } from '../llm/types';

/**
 * Result of a single provider test
 */
export interface ProviderTestResult {
  providerId: string;
  providerName: string;
  timestamp: Date;
  connectionTest: {
    passed: boolean;
    duration: number;
    error?: string;
    details?: {
      version?: string;
      modelsAvailable?: number;
      endpoint?: string;
    };
  };
  promptScoring?: {
    passed: boolean;
    duration: number;
    error?: string;
    result?: {
      overall: number;
      clarity: number;
      specificity: number;
      context: number;
      actionability: number;
      suggestions: string[];
    };
  };
  promptEnhancement?: {
    passed: boolean;
    duration: number;
    error?: string;
    result?: {
      original: string;
      enhanced: string;
      improvements: string[];
    };
  };
}

/**
 * Summary of all provider tests
 */
export interface ProviderTestSummary {
  totalProviders: number;
  testedProviders: number;
  passedProviders: number;
  failedProviders: number;
  totalDuration: number;
  results: ProviderTestResult[];
  timestamp: Date;
}

/**
 * Progress callback for test execution
 */
export type TestProgressCallback = (message: string, progress?: number) => void;

/**
 * Options for running tests
 */
export interface TestOptions {
  /** Test connection only (skip prompt scoring and enhancement) */
  connectionOnly?: boolean;

  /** Skip connection test (only test scoring and enhancement) */
  skipConnection?: boolean;

  /** Timeout for each test in milliseconds */
  timeout?: number;

  /** Custom test prompt */
  testPrompt?: string;

  /** Progress callback */
  onProgress?: TestProgressCallback;
}

/**
 * Provider E2E Testing Utility
 */
export class ProviderE2ETester {
  private testPrompt = 'Add error handling to the login function';

  constructor(private llmManager: LLMManager) {}

  /**
   * Run comprehensive tests on all configured providers
   */
  public async testAllProviders(options: TestOptions = {}): Promise<ProviderTestSummary> {
    const startTime = Date.now();
    const results: ProviderTestResult[] = [];

    const {
      connectionOnly = false,
      skipConnection = false,
      testPrompt,
      onProgress
    } = options;

    if (testPrompt) {
      this.testPrompt = testPrompt;
    }

    // Get all configured providers
    const providerTypes = this.llmManager.getConfiguredProviders();
    const totalProviders = providerTypes.length;

    if (totalProviders === 0) {
      return {
        totalProviders: 0,
        testedProviders: 0,
        passedProviders: 0,
        failedProviders: 0,
        totalDuration: 0,
        results: [],
        timestamp: new Date(),
      };
    }

    onProgress?.(`Testing ${totalProviders} provider(s)...`, 0);

    // Test each provider
    for (let i = 0; i < providerTypes.length; i++) {
      const providerId = providerTypes[i];
      const progress = ((i + 1) / totalProviders) * 100;

      onProgress?.(`Testing provider: ${providerId}...`, progress);

      try {
        const result = await this.testProvider(providerId, {
          connectionOnly,
          skipConnection,
        });
        results.push(result);
      } catch (error) {
        console.error(`[ProviderE2ETester] Failed to test provider ${providerId}:`, error);

        // Add failed result
        results.push({
          providerId,
          providerName: providerId,
          timestamp: new Date(),
          connectionTest: {
            passed: false,
            duration: 0,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    const endTime = Date.now();
    const passedProviders = results.filter(r =>
      r.connectionTest.passed &&
      (!r.promptScoring || r.promptScoring.passed) &&
      (!r.promptEnhancement || r.promptEnhancement.passed)
    ).length;

    onProgress?.('Tests completed', 100);

    return {
      totalProviders,
      testedProviders: results.length,
      passedProviders,
      failedProviders: results.length - passedProviders,
      totalDuration: endTime - startTime,
      results,
      timestamp: new Date(),
    };
  }

  /**
   * Test a specific provider
   */
  public async testProvider(
    providerId: LLMProviderType,
    options: Omit<TestOptions, 'onProgress' | 'testPrompt'> = {}
  ): Promise<ProviderTestResult> {
    const result: ProviderTestResult = {
      providerId,
      providerName: providerId,
      timestamp: new Date(),
      connectionTest: {
        passed: false,
        duration: 0,
      },
    };

    // Get provider instance
    const provider = this.llmManager.getProvider(providerId);
    if (!provider) {
      result.connectionTest.error = 'Provider not configured';
      return result;
    }

    // Test 1: Connection
    if (!options.skipConnection) {
      const connResult = await this.testConnection(provider);
      result.connectionTest = connResult;

      // If connection failed, skip other tests
      if (!connResult.passed) {
        return result;
      }
    }

    // Skip functional tests if connectionOnly is true
    if (options.connectionOnly) {
      return result;
    }

    // Test 2: Prompt Scoring
    try {
      const scoringResult = await this.testPromptScoring(provider);
      result.promptScoring = scoringResult;
    } catch (error) {
      result.promptScoring = {
        passed: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 3: Prompt Enhancement
    try {
      const enhancementResult = await this.testPromptEnhancement(provider);
      result.promptEnhancement = enhancementResult;
    } catch (error) {
      result.promptEnhancement = {
        passed: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return result;
  }

  /**
   * Test provider connection
   */
  private async testConnection(provider: any): Promise<ProviderTestResult['connectionTest']> {
    const startTime = Date.now();

    try {
      const result = await provider.testConnection();
      const duration = Date.now() - startTime;

      return {
        passed: result.success,
        duration,
        error: result.error,
        details: result.details,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test prompt scoring functionality
   */
  private async testPromptScoring(provider: any): Promise<NonNullable<ProviderTestResult['promptScoring']>> {
    const startTime = Date.now();

    try {
      const scorer = new PromptScorer(provider);
      const score = await scorer.scorePrompt(this.testPrompt);
      const duration = Date.now() - startTime;

      // Validate score structure
      if (
        typeof score.overall !== 'number' ||
        typeof score.clarity !== 'number' ||
        typeof score.specificity !== 'number' ||
        typeof score.context !== 'number' ||
        typeof score.actionability !== 'number' ||
        !Array.isArray(score.suggestions)
      ) {
        return {
          passed: false,
          duration,
          error: 'Invalid score structure returned',
        };
      }

      // Validate score ranges
      if (
        score.overall < 0 || score.overall > 100 ||
        score.clarity < 0 || score.clarity > 10 ||
        score.specificity < 0 || score.specificity > 10 ||
        score.context < 0 || score.context > 10 ||
        score.actionability < 0 || score.actionability > 10
      ) {
        return {
          passed: false,
          duration,
          error: 'Score values out of valid range',
        };
      }

      return {
        passed: true,
        duration,
        result: score,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test prompt enhancement functionality
   */
  private async testPromptEnhancement(provider: any): Promise<NonNullable<ProviderTestResult['promptEnhancement']>> {
    const startTime = Date.now();

    try {
      const enhancer = new PromptEnhancer(provider);
      const enhanced = await enhancer.enhancePrompt(this.testPrompt, 'medium');
      const duration = Date.now() - startTime;

      // Validate enhancement structure
      if (
        typeof enhanced.original !== 'string' ||
        typeof enhanced.enhanced !== 'string' ||
        !Array.isArray(enhanced.improvements)
      ) {
        return {
          passed: false,
          duration,
          error: 'Invalid enhancement structure returned',
        };
      }

      // Check that enhancement actually changed something
      if (enhanced.enhanced === enhanced.original && enhanced.improvements.length === 0) {
        return {
          passed: false,
          duration,
          error: 'Enhancement did not modify the prompt or provide improvements',
        };
      }

      return {
        passed: true,
        duration,
        result: enhanced,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Format test summary as human-readable string
   */
  public static formatSummary(summary: ProviderTestSummary): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('PROVIDER E2E TEST SUMMARY');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Total Providers:    ${summary.totalProviders}`);
    lines.push(`Tested:             ${summary.testedProviders}`);
    lines.push(`Passed:             ${summary.passedProviders} ✓`);
    lines.push(`Failed:             ${summary.failedProviders} ✗`);
    lines.push(`Total Duration:     ${summary.totalDuration}ms`);
    lines.push(`Timestamp:          ${summary.timestamp.toISOString()}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('PROVIDER DETAILS');
    lines.push('-'.repeat(60));

    for (const result of summary.results) {
      lines.push('');
      lines.push(`Provider: ${result.providerName} (${result.providerId})`);
      lines.push('');

      // Connection Test
      const connIcon = result.connectionTest.passed ? '✓' : '✗';
      lines.push(`  [${connIcon}] Connection Test (${result.connectionTest.duration}ms)`);
      if (result.connectionTest.error) {
        lines.push(`      Error: ${result.connectionTest.error}`);
      }
      if (result.connectionTest.details) {
        const details = result.connectionTest.details;
        if (details.version) {
          lines.push(`      Version: ${details.version}`);
        }
        if (details.modelsAvailable !== undefined) {
          lines.push(`      Models Available: ${details.modelsAvailable}`);
        }
        if (details.endpoint) {
          lines.push(`      Endpoint: ${details.endpoint}`);
        }
      }

      // Prompt Scoring
      if (result.promptScoring) {
        const scoreIcon = result.promptScoring.passed ? '✓' : '✗';
        lines.push(`  [${scoreIcon}] Prompt Scoring (${result.promptScoring.duration}ms)`);
        if (result.promptScoring.error) {
          lines.push(`      Error: ${result.promptScoring.error}`);
        }
        if (result.promptScoring.result) {
          const score = result.promptScoring.result;
          lines.push(`      Overall: ${score.overall}/100`);
          lines.push(`      Clarity: ${score.clarity}/10`);
          lines.push(`      Specificity: ${score.specificity}/10`);
          lines.push(`      Context: ${score.context}/10`);
          lines.push(`      Actionability: ${score.actionability}/10`);
          lines.push(`      Suggestions: ${score.suggestions.length}`);
        }
      }

      // Prompt Enhancement
      if (result.promptEnhancement) {
        const enhIcon = result.promptEnhancement.passed ? '✓' : '✗';
        lines.push(`  [${enhIcon}] Prompt Enhancement (${result.promptEnhancement.duration}ms)`);
        if (result.promptEnhancement.error) {
          lines.push(`      Error: ${result.promptEnhancement.error}`);
        }
        if (result.promptEnhancement.result) {
          const enh = result.promptEnhancement.result;
          lines.push(`      Improvements: ${enh.improvements.length}`);
          lines.push(`      Original Length: ${enh.original.length} chars`);
          lines.push(`      Enhanced Length: ${enh.enhanced.length} chars`);
        }
      }
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Format test result for a single provider
   */
  public static formatProviderResult(result: ProviderTestResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push(`TEST RESULT: ${result.providerName}`);
    lines.push('='.repeat(60));
    lines.push('');

    // Connection Test
    const connIcon = result.connectionTest.passed ? '✓' : '✗';
    lines.push(`[${connIcon}] Connection Test`);
    lines.push(`    Duration: ${result.connectionTest.duration}ms`);
    if (result.connectionTest.error) {
      lines.push(`    Error: ${result.connectionTest.error}`);
    }
    if (result.connectionTest.details) {
      const details = result.connectionTest.details;
      if (details.version) lines.push(`    Version: ${details.version}`);
      if (details.modelsAvailable !== undefined) lines.push(`    Models: ${details.modelsAvailable}`);
      if (details.endpoint) lines.push(`    Endpoint: ${details.endpoint}`);
    }
    lines.push('');

    // Prompt Scoring
    if (result.promptScoring) {
      const scoreIcon = result.promptScoring.passed ? '✓' : '✗';
      lines.push(`[${scoreIcon}] Prompt Scoring`);
      lines.push(`    Duration: ${result.promptScoring.duration}ms`);
      if (result.promptScoring.error) {
        lines.push(`    Error: ${result.promptScoring.error}`);
      } else if (result.promptScoring.result) {
        const score = result.promptScoring.result;
        lines.push(`    Overall Score: ${score.overall}/100`);
        lines.push(`    - Clarity: ${score.clarity}/10`);
        lines.push(`    - Specificity: ${score.specificity}/10`);
        lines.push(`    - Context: ${score.context}/10`);
        lines.push(`    - Actionability: ${score.actionability}/10`);
        lines.push(`    Suggestions:`);
        score.suggestions.forEach(s => lines.push(`      - ${s}`));
      }
      lines.push('');
    }

    // Prompt Enhancement
    if (result.promptEnhancement) {
      const enhIcon = result.promptEnhancement.passed ? '✓' : '✗';
      lines.push(`[${enhIcon}] Prompt Enhancement`);
      lines.push(`    Duration: ${result.promptEnhancement.duration}ms`);
      if (result.promptEnhancement.error) {
        lines.push(`    Error: ${result.promptEnhancement.error}`);
      } else if (result.promptEnhancement.result) {
        const enh = result.promptEnhancement.result;
        lines.push(`    Original: "${enh.original}"`);
        lines.push(`    Enhanced: "${enh.enhanced}"`);
        lines.push(`    Improvements:`);
        enh.improvements.forEach(i => lines.push(`      - ${i}`));
      }
      lines.push('');
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}
