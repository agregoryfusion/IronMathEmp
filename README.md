# Fusion Fast Math (Blazor)

This repository now ships a Blazor WebAssembly rebuild of the Fusion Fast Math training game so you can run it locally without publishing to GitHub Pages. Everything is contained in the `src/IronMathEmp` project.

## Prerequisites
- [.NET 8 SDK](https://dotnet.microsoft.com/download)

## Running locally
1. Restore packages: `dotnet restore src/IronMathEmp/IronMathEmp.csproj`
2. Start the development server: `dotnet run --project src/IronMathEmp/IronMathEmp.csproj`
3. Open the printed URL (typically `https://localhost:5001`) in your browser.

## Gameplay notes
- Start a run by entering a display name and clicking **Play**.
- You have 10 seconds per question and 12 questions per session.
- Stage difficulty increases every four questions.
- Completed sessions are captured in a local leaderboard for quick comparisons while you practice offline.
