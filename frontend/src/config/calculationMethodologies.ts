export interface CalculationFormulaDefinition {
  name: string;
  output: string;
  formula: string;
  description: string;
}

export interface CalculationMethodology {
  id: string;
  name: string;
  version: string;
  status: 'read-only';
  description: string;
  formulas: CalculationFormulaDefinition[];
  rules: string[];
  validations: string[];
  requiredInputs: string[];
  outputs: string[];
}

export const CALCULATION_METHODOLOGIES: CalculationMethodology[] = [
  {
    id: 'earned-premium',
    name: 'Earned Premium',
    version: '1.0',
    status: 'read-only',
    description: 'Daily pro-rata earning methodology currently executed by the P&C Earned Premium worker.',
    formulas: [
      {
        name: 'Effective End Date',
        output: 'End Date',
        formula: 'IF(Class = "MARINE CARGO" AND End Date is blank, Start Date + 6 months, End Date)',
        description: 'Uses the supplied policy end date. The exact MARINE CARGO class receives a six-month default term only when its end date is missing.'
      },
      {
        name: 'Policy Duration',
        output: 'Duration',
        formula: 'ROUND((End Date − Start Date) ÷ 1 day)',
        description: 'Counts the rounded number of days between policy start and effective end date.'
      },
      {
        name: 'Earned Period',
        output: 'Earned Period',
        formula: 'IF(Valuation End + 1 day > Start Date, ROUND((MIN(End Date, Valuation End + 1 day) − Start Date) ÷ 1 day), 0)',
        description: 'The extra day makes the selected valuation end date inclusive.'
      },
      {
        name: 'Earned Fraction',
        output: 'Earned Fraction',
        formula: 'MIN(1, MAX(0, Earned Period ÷ Duration))',
        description: 'Constrains the earned proportion to the range 0%–100%.'
      },
      {
        name: 'Earned Premium',
        output: 'EP',
        formula: 'Gross Premium × Earned Fraction',
        description: 'Recognises premium in proportion to the policy period earned at the valuation date.'
      },
      {
        name: 'Unearned Premium Reserve Period',
        output: 'UPR Period',
        formula: 'MAX(0, Duration − Earned Period)',
        description: 'Measures the remaining unearned policy days.'
      },
      {
        name: 'Unearned Premium Reserve',
        output: 'UPR',
        formula: 'Gross Premium − Earned Premium',
        description: 'Keeps earned and unearned premium reconciled to gross premium.'
      },
      {
        name: 'Deferred Acquisition Cost',
        output: 'DAC',
        formula: 'IF(Valuation Start ≤ Registration Date < Valuation End + 1 day, Commission × (UPR ÷ Gross Premium), 0)',
        description: 'Defers the unearned share of commission only for registrations inside the valuation window.'
      },
      {
        name: 'Gross Written Premium YTD',
        output: 'GWP YTD',
        formula: 'IF(Valuation Start ≤ Registration Date < Valuation End + 1 day, Gross Premium, 0)',
        description: 'Includes the full premium when registration falls inside the valuation window.'
      }
    ],
    rules: [
      'Dates are normalised to calendar dates before calculations run.',
      'Valuation End is inclusive by applying a one-day cutoff offset.',
      'The exact MARINE CARGO class with no end date uses Start Date plus six calendar months.',
      'Class summaries aggregate EP, UPR, DAC, GWP YTD and the earned fractions of calculated rows.',
      'The same methodology is applied to every uploaded production file.'
    ],
    validations: [
      'An invalid registration, start or effective end date is counted as “Missing or invalid dates”.',
      'An end date before start date is counted as “End date before start date”.',
      'Zero or non-numeric gross premium is counted as “Zero premium”.',
      'A duration of zero or less is counted as “Zero or negative duration”.',
      'Rows that fail validation are excluded from financial totals and counted in the Processing KPIs.'
    ],
    requiredInputs: [
      'REGISTRATN_DT or REG_DATE',
      'START_DATE',
      'END_DATE',
      'CLASS',
      'PREMIUM or GROSS_PREMIUM',
      'COMM or COMMISSION'
    ],
    outputs: [
      'Duration',
      'Earned Period',
      'Earned Fraction',
      'Earned Premium',
      'UPR Period',
      'UPR',
      'DAC',
      'GWP YTD'
    ]
  }
];
