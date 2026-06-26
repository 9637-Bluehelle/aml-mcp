import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  onStepClick?: (step: number) => void;
}

export function StepIndicator({ currentStep, totalSteps, stepLabels, onStepClick }: StepIndicatorProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step, index) => {
          const isActive = step === currentStep;
          const isCompleted = step < currentStep;
          const isClickable = onStepClick && (isCompleted || isActive);

          return (
            <div key={step} className="flex items-center flex-1">
              {/* Step Circle */}
              <div className="flex flex-col items-center flex-1">
                <button
                  onClick={() => isClickable && onStepClick(step)}
                  disabled={!isClickable}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all
                    ${isActive 
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100' 
                      : isCompleted
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-200 text-gray-500'
                    }
                    ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                  `}
                  title={stepLabels[index]}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span>{step}</span>
                  )}
                </button>
                
                {/* Step Label */}
                <span 
                  className={`
                    mt-2 text-xs text-center max-w-[120px] leading-tight
                    ${isActive ? 'text-blue-600 font-semibold' : 'text-gray-600'}
                  `}
                >
                  {stepLabels[index]}
                </span>
              </div>

              {/* Connector Line */}
              {index < totalSteps - 1 && (
                <div 
                  className={`
                    h-1 flex-1 mx-2 -mt-6 transition-colors
                    ${step < currentStep ? 'bg-green-600' : 'bg-gray-200'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progresso</span>
          <span className="font-semibold">{Math.round(((currentStep - 1) / (totalSteps - 1)) * 100)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
