import secrets
import string

alphabet = string.ascii_letters + string.digits

def rand(n=32):
    return ''.join(secrets.choice(alphabet) for _ in range(n))

print('ADMIN_PASSWORD=' + rand(18))
print('API_KEY_ENCRYPTION_KEY=' + rand(32))
print('ADMIN_TOKEN=' + rand(40))
