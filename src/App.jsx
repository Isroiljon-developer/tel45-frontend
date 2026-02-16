import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './index.css';

const API_URL = 'https://tel45-backend.onrender.com/api';

// Axios interceptor - har bir so'rovga tokenni ulash
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

// Axios response interceptor - agar 401/403 (ruxsat yo'q) qaytsa, tizimdan chiqarish
axios.interceptors.response.use(response => response, error => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        localStorage.removeItem('token');
        localStorage.removeItem('isLoggedIn');
        window.location.reload(); // Login sahifasiga qaytish
    }
    return Promise.reject(error);
});

function App() {
    // Login State
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    // App State
    const [activeTab, setActiveTab] = useState('yangi');
    const [items, setItems] = useState([]);
    const [stats, setStats] = useState({});
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const loaderRef = useRef(null);

    // Load initial data when tab changes (ONLY if logged in)
    useEffect(() => {
        if (!isLoggedIn) return;

        // Endi avtomatik 5000 qator qilinmaydi. Bor ma'lumot yuklanadi.
        setItems([]);
        setPage(0);
        setHasMore(true);
        fetchItems(0, true);
        fetchStats();
    }, [activeTab, isLoggedIn]);

    // Search debounce
    useEffect(() => {
        if (!isLoggedIn) return;
        const delayDebounceFn = setTimeout(() => {
            setItems([]);
            setPage(0);
            setHasMore(true);
            fetchItems(0, true);
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    const tableWrapperRef = useRef(null);

    // Infinite Scroll
    useEffect(() => {
        if (!isLoggedIn) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                setPage(prev => prev + 1);
            }
        }, {
            root: tableWrapperRef.current, // Skroll bo'ladigan konteynerni ko'rsatamiz
            threshold: 0.1
        });

        if (loaderRef.current) observer.observe(loaderRef.current);
        return () => observer.disconnect();
    }, [hasMore, loading, isLoggedIn]);

    // Fetch items when page changes
    useEffect(() => {
        if (page > 0 && isLoggedIn) fetchItems(page);
    }, [page]);

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            // Serverdan login qilish
            const res = await axios.post(`${API_URL}/login`, { username, password });

            // Agar muvaffaqiyatli bo'lsa
            const token = res.data.token;
            localStorage.setItem('token', token);
            localStorage.setItem('isLoggedIn', 'true');

            setIsLoggedIn(true);
            setLoginError('');

            window.location.reload();

        } catch (err) {
            console.error(err);
            setLoginError("Login yoki parol noto'g'ri!");
        }
    };

    const fetchItems = async (pageNum, reset = false) => {
        if (loading) return;
        setLoading(true);
        try {
            const limit = 500; // 200 dan 500 ga oshirildi (birdaniga ko'p ko'rinishi uchun)
            const offset = pageNum * limit;
            const res = await axios.get(`${API_URL}/items`, {
                params: { tab: activeTab, limit, offset, search }
            });

            if (res.data.length < limit) setHasMore(false);

            setItems(prev => reset ? res.data : [...prev, ...res.data]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await axios.get(`${API_URL}/stats`, { params: { tab: activeTab } });
            setStats(res.data);
        } catch (err) { console.error(err); }
    };

    // KO'P QATOR QO'SHISH
    const addItems = async () => {
        const countStr = prompt("Nechta qator qo'shmoqchisiz?", "1");
        if (countStr === null) return;
        const count = parseInt(countStr);

        if (isNaN(count) || count <= 0) {
            alert("Iltimos, to'g'ri son kiriting!");
            return;
        }

        // Serverga so'rov yuborish (birma-bir yoki optimallashtirilgan backend route kerak bo'lishi mumkin)
        // Hozir soddalik uchun loop qilamiz, lekin juda ko'p bo'lsa serverni qiynashi mumkin.
        // Backendda bulk insert yo'q edi, shuning uchun loop qilamiz
        // Agar 100 tadan ko'p bo'lsa, ogohlantiramiz.
        if (count > 100 && !window.confirm(`${count} ta qator qo'shish biroz vaqt olishi mumkin. Davom etaymi?`)) return;

        try {
            setLoading(true);
            // Parallel requests (max 10-20 at a time suggested, but for local 50 is fine)
            const promises = [];
            for (let i = 0; i < count; i++) {
                promises.push(axios.post(`${API_URL}/items`, { tab: activeTab }));
            }

            const responses = await Promise.all(promises);
            const newItems = responses.map(r => r.data);

            // Yangi qatorlar jadval oxiriga qo'shiladi
            setItems(prev => [...prev, ...newItems]);
            fetchStats();
        } catch (err) {
            console.error(err);
            alert("Xatolik yuz berdi!");
        } finally {
            setLoading(false);
        }
    };

    const updateItem = async (id, field, value) => {
        const newItems = items.map(item => item.id === id ? { ...item, [field]: value } : item);
        setItems(newItems);

        try {
            await axios.put(`${API_URL}/items/${id}`, { [field]: value });
            if (['purchase_price', 'sale_price', 'sold_date'].includes(field)) {
                fetchStats();
            }
        } catch (err) { console.error(err); }
    };

    const deleteItem = async (id) => {
        if (!window.confirm('Delete this row?')) return;
        try {
            await axios.delete(`${API_URL}/items/${id}`);
            setItems(prev => prev.filter(i => i.id !== id));
            fetchStats();
        } catch (err) { console.error(err); }
    };

    const returnItem = async (id) => {
        if (!window.confirm('Return this item?')) return;
        try {
            const res = await axios.post(`${API_URL}/items/${id}/return`);
            setItems(prev => prev.map(i => i.id === id ? res.data : i));
            fetchStats();
        } catch (err) { console.error(err); }
    };

    // LOGIN UI
    if (!isLoggedIn) {
        return (
            <div className="login-container">
                <div className="login-box">
                    <h2>Tizimga kirish</h2>
                    {loginError && <p className="error-msg">{loginError}</p>}
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label>Login:</label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="Loginni kiriting"
                            />
                        </div>
                        <div className="form-group">
                            <label>Parol:</label>
                            <input
                                type="text" // Parol ko'rinib turishi uchun text qildim
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Parolni kiriting"
                            />
                        </div>
                        <button type="submit" className="login-btn">Kirish</button>
                    </form>
                </div>
            </div>
        );
    }

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('isLoggedIn');
        setIsLoggedIn(false);
        window.location.reload();
    };

    // MAIN APP UI
    return (
        <div className="container">
            <div className="header">
                <h1>Phone CRM</h1>

                <div className="tabs">
                    {['yangi', 'koreyskiy'].map(tab => (
                        <button
                            key={tab}
                            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="controls">
                    <div className="total-count-badge">
                        Jami Qatorlar: <b>{stats.total_rows_count || 0}</b>
                    </div>
                    <input
                        type="text"
                        placeholder="Qidirish..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="primary" onClick={addItems}>+ Qator Qo'shish</button>
                    <button className="logout-btn" onClick={handleLogout} style={{ marginLeft: '10px', background: '#fee2e2', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>🚪</button>
                </div>
            </div>

            <div className="summary">
                <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <span className="stat-label">Jami Tovar</span>
                    <span className="stat-value">{stats.total_items_count || 0}</span>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                    <span className="stat-label">Ombordagi Summa</span>
                    <span className="stat-value">{(stats.total_inventory_value || 0).toLocaleString()} so'm</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Sotildi (Xarid)</span>
                    <span className="stat-value">{(stats.total_purchase_sold || 0).toLocaleString()} so'm</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Sotildi (Sotuv)</span>
                    <span className="stat-value">{(stats.total_sales || 0).toLocaleString()} so'm</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Foyda</span>
                    <span className={`stat-value ${stats.total_profit >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                        {(stats.total_profit || 0).toLocaleString()} so'm
                    </span>
                </div>
            </div>

            <div className="table-wrapper" ref={tableWrapperRef}>
                <table>
                    <thead>
                        <tr>
                            <th>№</th>
                            <th>F.I.O</th>
                            <th>Sana</th>
                            <th>Model</th>
                            <th>IMEI</th>
                            <th>GB</th>
                            <th>Xarid (so'm)</th>
                            <th>Sotilgan Sana</th>
                            <th>Sotuv (so'm)</th>
                            <th>Foyda</th>
                            <th>Amallar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const isSold = item.sold_date && item.sold_date.trim() !== '';
                            const profit = (item.sale_price || 0) - (item.purchase_price || 0);

                            return (
                                <tr key={item.id} className={isSold ? 'sold' : ''}>
                                    <td>{index + 1}</td>
                                    <td><input type="text" value={item.fio} onChange={e => updateItem(item.id, 'fio', e.target.value)} /></td>
                                    <td><input type="text" placeholder="kk.oo.yyyy" value={item.sana} onChange={e => updateItem(item.id, 'sana', e.target.value)} /></td>
                                    <td><input type="text" value={item.model} onChange={e => updateItem(item.id, 'model', e.target.value)} /></td>
                                    <td><input type="text" value={item.imei} onChange={e => updateItem(item.id, 'imei', e.target.value)} /></td>
                                    <td><input type="text" value={item.gb} onChange={e => updateItem(item.id, 'gb', e.target.value)} /></td>
                                    <td><input type="number" placeholder="0" value={item.purchase_price} onChange={e => updateItem(item.id, 'purchase_price', e.target.value)} /></td>
                                    <td><input type="text" placeholder="kk.oo.yyyy" value={item.sold_date} onChange={e => updateItem(item.id, 'sold_date', e.target.value)} /></td>
                                    <td><input type="number" placeholder="0" value={item.sale_price} onChange={e => updateItem(item.id, 'sale_price', e.target.value)} /></td>
                                    <td className={profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                                        {isSold ? profit.toLocaleString() : '-'}
                                    </td>
                                    <td>
                                        {isSold ? (
                                            <button className="btn-sm btn-warning" onClick={() => returnItem(item.id)}>Qaytarish</button>
                                        ) : (
                                            <button className="btn-sm btn-danger" onClick={() => deleteItem(item.id)}>O'chirish</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr ref={loaderRef}>
                            <td colSpan="11" style={{ textAlign: 'center', padding: '10px' }}>
                                {loading ? 'Yuklanmoqda...' : ''}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default App;
