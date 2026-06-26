import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  button?:ReactNode;
}

export function Card({ title, icon, children, button, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-200" style={{display:'flex', justifyContent:'space-between'}}>
          <h2 className={`text-lg font-semibold text-gray-900 ${icon?'mb-3 flex items-center gap-2':''}`}>
            {icon? icon : <></>}
            {title}
          </h2>
          {button ? button : <></>}
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}
