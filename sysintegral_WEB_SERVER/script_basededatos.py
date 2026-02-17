from werkzeug.security import generate_password_hash

hashed_password = generate_password_hash('admin#2020#')
print(hashed_password)
