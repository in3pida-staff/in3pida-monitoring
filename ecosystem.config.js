module.exports = {
    apps: [{
        name:        'in3pida-monitoring',
        script:      'server.js',
        instances:   1,
        autorestart: true,
        watch:       false,
        env: {
            NODE_ENV: 'production',
            PORT:     3000
        }
    }]
};
