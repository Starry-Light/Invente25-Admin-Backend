import React, { createContext, useContext, useEffect, useState } from 'react'
import { createApi } from '../api/api'
import axios from 'axios'


const AuthContext = createContext(null)


export function useAuth() { return useContext(AuthContext) }


export function AuthProvider({ children }) {
const [token, setToken] = useState(localStorage.getItem('token'))
const [user, setUser] = useState(() => {
const raw = localStorage.getItem('user')
return raw ? JSON.parse(raw) : null
})


useEffect(() => {
if (token) localStorage.setItem('token', token)
else { localStorage.removeItem('token'); localStorage.removeItem('user') }
}, [token])


useEffect(() => {
if (user) localStorage.setItem('user', JSON.stringify(user))
}, [user])


const login = async (email, password) => {
const resp = await axios.post(`${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}/auth/login`, { email, password })
const t = resp.data.token
const payload = JSON.parse(atob(t.split('.')[1]))
setToken(t)
setUser({ email: payload.email, role: payload.role, department_id: payload.department_id })
return { token: t, user: payload }
}


const logout = () => { setToken(null); setUser(null) }


const authAxios = createApi(token)


return (
<AuthContext.Provider value={{ token, user, login, logout, authAxios }}>
{children}
</AuthContext.Provider>
)
}