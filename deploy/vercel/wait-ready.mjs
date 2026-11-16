for (let attempt = 0; attempt < 30; attempt++) {
    try {
        const [api, frontend] = await Promise.all([
            fetch('http://127.0.0.1:3000/api/auth/me', { signal: AbortSignal.timeout(1000) }),
            fetch('http://127.0.0.1:8081/', { signal: AbortSignal.timeout(1000) }),
        ]);
        if (api.status === 401 && frontend.ok) process.exit(0);
    } catch { /* Services are still booting. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.error('The API or Apache did not become ready; inspect their startup logs.');
process.exit(1);
