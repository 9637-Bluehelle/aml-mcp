interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export function StepIndicator({ currentStep, totalSteps = 3 }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
        <div key={step} className="flex items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
            currentStep === step ? 'bg-blue-600 text-white' :
            currentStep > step ? 'bg-green-600 text-white' :
            'bg-gray-200 text-gray-600'
          }`}>
            {step}
          </div>
          {step < totalSteps && (
            <div className={`w-16 h-1 ${
              currentStep > step ? 'bg-green-600' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}
