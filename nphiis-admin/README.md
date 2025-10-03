# NPHIIS Admin Dashboard

A modern administrative dashboard for managing users in the NPHIIS (National Public Health Information and Intelligence System) Health Information Exchange system.

## Features

- **Simple Authentication**: Username/password authentication for admin access
- **User Management**: View, create, and manage system users
- **Role-Based Access**: Support for multiple user roles including:
  - System Administrator
  - Super User
  - County Disease Surveillance Officer
  - Subcounty Disease Surveillance Officer
  - Facility Surveillance Focal Person
  - Supervisors
  - Vaccinators
  - NURSE
- **Modern UI**: Built with Next.js, TypeScript, and Tailwind CSS
- **Mock Data**: Includes sample users and simulated API responses

## Prerequisites

- Node.js 18+ 
- Yarn or npm

## Installation

1. Clone the repository and install dependencies:
```bash
yarn install
```

## Development

Start the development server:
```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Authentication

The application uses simple username/password authentication:

- **Username**: admin
- **Password**: admin123

Note: This is for demonstration purposes only. In a production environment, you would integrate with a proper authentication system.

## Sample Data

The application includes sample user data for testing:
- ID Number: 101010
- Password: password
- Email: clerk-1@gmail.com
- Role: NURSE
- First Name: Ian
- Last Name: Mark
- Location ID: 23541
- Phone: 0712345678

## Project Structure

```
src/
├── app/                 # Next.js app directory
│   ├── globals.css     # Global styles
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Main page
├── components/         # React components
│   ├── AdminDashboard.tsx
│   ├── AdminLogin.tsx
│   ├── CreateUserForm.tsx
│   ├── Navigation.tsx
│   └── UserList.tsx
├── lib/               # Utility libraries
│   └── api.ts         # API functions (mock data)
└── types/             # TypeScript type definitions
    └── user.ts        # User-related types
```

## Technologies Used

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **React Hook Form**: Form management
- **Zod**: Schema validation
- **Heroicons**: Icon library

## Building for Production

```bash
yarn build
yarn start
```

## License

This project is part of the NPHIIS Health Information Exchange system.
