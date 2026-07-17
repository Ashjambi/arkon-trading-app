export type StressScenario = {
  enabled: boolean;
  name?: string;
  volatilityMultiplier?: number;
  forceExecutionDelay?: boolean;
  forceDegradedData?: boolean;
  executionPenaltyFactor?: number;
  maxSignalsCapOverride?: number;
};

class StressScenarioServiceImpl {
  private scenario: StressScenario = { enabled: false };

  setScenario(scenario: StressScenario): void {
    this.scenario = { ...scenario };
  }

  clearScenario(): void {
    this.scenario = { enabled: false };
  }

  getScenario(): StressScenario {
    return this.scenario;
  }

  isEnabled(): boolean {
    return this.scenario.enabled;
  }

  applyExecutionPenalty(size: number): number {
    if (!this.scenario.enabled || this.scenario.executionPenaltyFactor === undefined) {
      return size;
    }
    return size * this.scenario.executionPenaltyFactor;
  }

  shouldForceDelay(): boolean {
    return this.scenario.enabled && !!this.scenario.forceExecutionDelay;
  }

  shouldForceDegradedData(): boolean {
    return this.scenario.enabled && !!this.scenario.forceDegradedData;
  }

  getVolatilityMultiplier(): number {
    if (!this.scenario.enabled || this.scenario.volatilityMultiplier === undefined) {
      return 1.0;
    }
    return this.scenario.volatilityMultiplier;
  }

  getMaxSignalsCapOverride(): number | null {
    if (!this.scenario.enabled || this.scenario.maxSignalsCapOverride === undefined) {
      return null;
    }
    return this.scenario.maxSignalsCapOverride;
  }
}

export const stressScenarioService = new StressScenarioServiceImpl();
