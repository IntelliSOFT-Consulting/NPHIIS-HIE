'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from '@untitled-ui/icons-react';
import { Field, TextInput } from './ui/Field';
import { Alert } from './ui/Alert';

interface AdminLoginProps {
  onLogin: (
    idNumber: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await onLogin(idNumber, password);

    if (!result.success) {
      setError(result.error || 'Invalid ID number or password');
    }

    setIsLoading(false);
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-white shadow-xl rounded-xl overflow-hidden">
          {/* Header with logos */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-center gap-6 max-w-full">
              <img
                src="/moh.png"
                alt="Ministry of Health Logo"
                className="h-14 max-w-[120px] object-contain"
              />
              <img
                src="/nphi.png"
                alt="NPHI Logo"
                className="h-14 max-w-[120px] object-contain"
              />
            </div>
            <h2 className="mt-5 text-center text-xl font-bold text-blue-600 leading-tight">
              National Public Health Intelligence<br />
              Information System (NPHIIS)
            </h2>
          </div>

          {/* Admin Portal section */}
          <div className="bg-gray-50 px-8 py-4 border-t border-b border-gray-100">
            <p className="text-center text-sm font-medium text-gray-700">
              Admin Portal
            </p>
            <p className="text-center text-xs text-gray-500 mt-1">
              Sign in to manage users and system settings
            </p>
          </div>

          {/* Form section */}
          <div className="px-8 py-6">
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
              {error && <Alert variant="error">{error}</Alert>}

              <Field label="ID Number" htmlFor="idNumber" required>
                <TextInput
                  id="idNumber"
                  type="text"
                  required
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="Enter your ID number"
                />
              </Field>

              <Field label="Password" htmlFor="password" required>
                <div className="relative">
                  <TextInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </Field>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing in…
                  </div>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-center text-xs text-gray-500">
              NPHIIS Health Information Exchange
            </p>
            <p className="text-center text-xs text-gray-500 mt-2">
              <Link href="/privacy-policy" className="text-blue-600 hover:text-blue-800 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
