import React, { useState, useEffect } from 'react';
import { usersAPI, User } from '../api/client';
import { UserPlus, Trash2, RotateCcw, AlertCircle } from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data);
    } catch (err: any) {
      setError('Error al cargar usuarios');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await usersAPI.create(newUsername);
      setSuccess(`Usuario creado. Contraseña temporal: ${response.data.defaultPassword}`);
      setNewUsername('');
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!confirm(`¿Eliminar usuario ${username}?`)) return;

    try {
      await usersAPI.delete(id);
      setSuccess('Usuario eliminado exitosamente');
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar usuario');
    }
  };

  const handleResetPassword = async (id: number, username: string) => {
    if (!confirm(`¿Resetear contraseña de ${username}?`)) return;

    try {
      const response = await usersAPI.resetPassword(id);
      setSuccess(`Contraseña reseteada. Nueva contraseña: ${response.data.defaultPassword}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al resetear contraseña');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-white">
          <UserPlus className="w-6 h-6 md:w-8 md:h-8" />
          Gestión de Usuarios
        </h1>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-4 md:p-6 mb-4 md:mb-6">
        {/* Formulario crear usuario */}
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Nombre de usuario"
              className="flex-1 px-4 py-2.5 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 transition duration-200 disabled:opacity-50 text-sm md:text-base w-full sm:w-auto"
            >
              <UserPlus className="w-5 h-5" />
              Crear Usuario
            </button>
          </div>
        </form>

        {/* Mensajes */}
        <div className="mt-4">
          {error && (
            <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2 text-xs md:text-sm">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-600 text-green-200 px-4 py-3 rounded-lg text-xs md:text-sm">
              {success}
            </div>
          )}
        </div>
      </div>

      {/* Lista de usuarios - Vista Mobile (Cards) */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {users.map((user) => (
          <div key={user.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{user.username}</h3>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                  user.role === 'super_admin' 
                    ? 'bg-purple-600 text-purple-100' 
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {user.role}
                </span>
              </div>
              <div className="flex gap-2">
                {user.role !== 'super_admin' && (
                  <>
                    <button
                      onClick={() => handleResetPassword(user.id, user.username)}
                      className="text-blue-400 hover:text-blue-300 p-2 rounded bg-slate-700"
                      title="Resetear contraseña"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id, user.username)}
                      className="text-red-400 hover:text-red-300 p-2 rounded bg-slate-700"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Creado:</span>
                <span>{new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Estado:</span>
                {user.requirePasswordChange ? (
                  <span className="text-orange-500">Debe cambiar contraseña</span>
                ) : (
                  <span className="text-green-500">Activo</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lista de usuarios - Vista Desktop (Table) */}
      <div className="hidden sm:block bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-700/30">
                <th className="text-left py-3 px-4 font-semibold text-slate-300">Usuario</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-300">Rol</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-300">Creado</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-300">Estado</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                  <td className="py-3 px-4 text-slate-200 font-medium">{user.username}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.role === 'super_admin' 
                        ? 'bg-purple-600 text-purple-100' 
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    {user.requirePasswordChange ? (
                      <span className="text-orange-500 text-sm">Debe cambiar contraseña</span>
                    ) : (
                      <span className="text-green-500 text-sm">Activo</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      {user.role !== 'super_admin' && (
                        <>
                          <button
                            onClick={() => handleResetPassword(user.id, user.username)}
                            className="text-blue-400 hover:text-blue-300 p-2 rounded hover:bg-slate-700 transition-colors"
                            title="Resetear contraseña"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-slate-700 transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
