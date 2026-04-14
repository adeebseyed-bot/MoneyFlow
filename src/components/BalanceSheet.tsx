/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Download, 
  Share2, 
  Trash2, 
  FileText, 
  Table as TableIcon, 
  FileSpreadsheet,
  Calendar as CalendarIcon,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  IndianRupee,
  Save,
  X,
  Layers,
  Edit2,
  History,
  Archive,
  CheckCircle2,
  Clock,
  LogOut,
  User as UserIcon,
  LogIn,
  RefreshCcw
} from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { Transaction, exportToPDF, exportToExcel, exportToWord, formatRupee } from '@/src/lib/exportUtils';
import { cn } from '@/lib/utils';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  serverTimestamp,
  User,
  handleFirestoreError,
  OperationType
} from '@/src/lib/firebase';

interface BalanceAdjustment {
  type: 'none' | 'add' | 'subtract' | 'divide' | 'percent' | 'override';
  value: number;
  colorPreference?: 'primary' | 'success' | 'destructive';
  iconPreference?: 'none' | 'up' | 'down' | 'dollar' | 'wallet';
}

interface Sheet {
  id: string;
  name: string;
  transactions: Transaction[];
  savedAt?: string;
  adjustment?: BalanceAdjustment;
}

export default function BalanceSheet() {
  const [user, setUser] = React.useState<User | null>(null);
  const [sheets, setSheets] = React.useState<Sheet[]>([]);
  const [activeSheetId, setActiveSheetId] = React.useState('');
  const [savedSheets, setSavedSheets] = React.useState<Sheet[]>([]);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);
  
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<string | null>(null);
  const [sheetToRename, setSheetToRename] = React.useState<{id: string, name: string} | null>(null);
  const [transactionToEdit, setTransactionToEdit] = React.useState<Transaction | null>(null);
  const [adjustmentInput, setAdjustmentInput] = React.useState('');

  const [inlineEntry, setInlineEntry] = React.useState<Omit<Transaction, 'id'>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    particulars: '',
    debit: 0,
    credit: 0
  });

  // Firebase Auth Listener
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync - Load Sheets
  React.useEffect(() => {
    if (!user) return;

    const q = query(collection(db, `users/${user.uid}/sheets`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const remoteSheets: Sheet[] = [];
      snapshot.forEach((doc) => {
        remoteSheets.push({ id: doc.id, ...doc.data() } as Sheet);
      });
      
      if (remoteSheets.length > 0) {
        setSheets(remoteSheets);
        // If no active sheet or active sheet not in remote, set first one
        if (!activeSheetId || !remoteSheets.find(s => s.id === activeSheetId)) {
          setActiveSheetId(remoteSheets[0].id);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/sheets`);
    });

    return () => unsubscribe();
  }, [user]);

  // Firestore Sync - Push Changes
  const syncToFirestore = async (updatedSheets: Sheet[], currentActiveId: string) => {
    if (!user) return;

    try {
      // For simplicity in this demo, we sync all sheets
      // In a real app, you'd sync individual documents on change
      for (const sheet of updatedSheets) {
        const sheetRef = doc(db, `users/${user.uid}/sheets`, sheet.id);
        await setDoc(sheetRef, {
          ...sheet,
          ownerId: user.uid,
          savedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/sheets`);
    }
  };

  // Load from localStorage on mount (only if not logged in)
  React.useEffect(() => {
    if (user) return;

    const savedSession = localStorage.getItem('ledgerflow_current_session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed.sheets && parsed.sheets.length > 0) {
          setSheets(parsed.sheets);
          setActiveSheetId(parsed.activeSheetId || parsed.sheets[0].id);
        }
      } catch (e) {
        console.error("Failed to load session", e);
      }
    }
    
    const history = localStorage.getItem('ledgerflow_history');
    if (history) {
      try {
        setSavedSheets(JSON.parse(history));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, [user]);

  // Save current session to localStorage or Firestore on change
  const handleSave = async () => {
    if (sheets.length === 0) return;
    setIsSaving(true);

    try {
      if (user) {
        // Online Save (Firebase)
        await syncToFirestore(sheets, activeSheetId);
      } else {
        // Offline Save (Local Storage)
        localStorage.setItem('ledgerflow_current_session', JSON.stringify({ sheets, activeSheetId }));
      }
      
      const now = new Date();
      setLastSaved(format(now, 'HH:mm:ss'));
    } catch (error) {
      console.error("Save failed", error);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in failed", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setSheets([]);
      setActiveSheetId('');
    } catch (error) {
      console.error("Sign out failed", error);
    }
  };

  const activeSheet = useMemo(() => 
    sheets.find(s => s.id === activeSheetId) || sheets[0], 
  [sheets, activeSheetId]);

  const totals = useMemo(() => {
    if (!activeSheet) return { debit: 0, credit: 0, balance: 0, rawBalance: 0, adjustmentAmount: 0 };
    const debit = activeSheet.transactions.reduce((sum, t) => sum + t.debit, 0);
    const credit = activeSheet.transactions.reduce((sum, t) => sum + t.credit, 0);
    const rawBalance = credit - debit;
    
    let adjustedBalance = rawBalance;
    const adj = activeSheet.adjustment;
    let adjustmentAmount = 0;
    
    if (adj && adj.type !== 'none') {
      switch (adj.type) {
        case 'add': 
          adjustedBalance += adj.value; 
          adjustmentAmount = adj.value;
          break;
        case 'subtract': 
          adjustedBalance -= adj.value; 
          adjustmentAmount = -adj.value;
          break;
        case 'divide': 
          if (adj.value !== 0) {
            adjustedBalance /= adj.value; 
            adjustmentAmount = adjustedBalance - rawBalance;
          }
          break;
        case 'percent': 
          const diff = (rawBalance * (adj.value / 100));
          adjustedBalance -= diff; 
          adjustmentAmount = -diff;
          break;
        case 'override': 
          adjustedBalance = adj.value; 
          adjustmentAmount = adj.value - rawBalance;
          break;
      }
    }

    return {
      debit,
      credit,
      balance: adjustedBalance,
      rawBalance,
      adjustmentAmount
    };
  }, [activeSheet]);

  const updateAdjustment = (adj: BalanceAdjustment) => {
    if (!activeSheet) return;
    setSheets(prev => prev.map(s => 
      s.id === activeSheet.id ? { ...s, adjustment: adj } : s
    ));
    setAdjustmentInput(adj.value.toString());
  };

  const handleAdjustmentInputChange = (val: string) => {
    if (!activeSheet) return;
    // Allow only numbers and one decimal point
    if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
      setAdjustmentInput(val);
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) {
        setSheets(prev => prev.map(s => s.id === activeSheet.id ? { 
          ...s, 
          adjustment: { ...(s.adjustment || { type: 'none', value: 0 }), value: parsed } 
        } : s));
      } else if (val === '' || val === '-') {
        setSheets(prev => prev.map(s => s.id === activeSheet.id ? { 
          ...s, 
          adjustment: { ...(s.adjustment || { type: 'none', value: 0 }), value: 0 } 
        } : s));
      }
    }
  };

  const handleAddSheet = () => {
    const newSheet: Sheet = {
      id: `sheet-${Math.random().toString(36).substr(2, 9)}`,
      name: `Sheet ${sheets.length + 1}`,
      transactions: []
    };
    setSheets([...sheets, newSheet]);
    setActiveSheetId(newSheet.id);
  };

  const handleSaveToHistory = () => {
    if (sheets.length === 0) return;
    
    const sheetsWithTimestamp = sheets.map(s => ({
      ...s,
      savedAt: new Date().toISOString()
    }));
    
    const newHistory = [...sheetsWithTimestamp, ...savedSheets];
    setSavedSheets(newHistory);
    localStorage.setItem('ledgerflow_history', JSON.stringify(newHistory));
    
    // Optional: Clear current session after saving? 
    // The user said "add an option to save", usually implies snapshotting.
    // I'll keep them in current session but notify user.
    alert("Sheets saved to history successfully!");
  };

  const restoreFromHistory = (sheet: Sheet) => {
    const newSheet = { ...sheet, id: `sheet-${Math.random().toString(36).substr(2, 9)}` };
    setSheets([...sheets, newSheet]);
    setActiveSheetId(newSheet.id);
    setIsHistoryDialogOpen(false);
  };

  const deleteFromHistory = (id: string) => {
    const newHistory = savedSheets.filter(s => s.id !== id);
    setSavedSheets(newHistory);
    localStorage.setItem('ledgerflow_history', JSON.stringify(newHistory));
  };

  const handleDeleteSheet = (id: string) => {
    if (sheets.length <= 1) {
      setSheets([]);
      setActiveSheetId('');
      return;
    }
    
    const newSheets = sheets.filter(s => s.id !== id);
    setSheets(newSheets);
    if (activeSheetId === id) {
      setActiveSheetId(newSheets[0].id);
    }
  };

  const handleRenameSheet = () => {
    if (!sheetToRename) return;
    setSheets(sheets.map(s => s.id === sheetToRename.id ? { ...s, name: sheetToRename.name } : s));
    setIsRenameDialogOpen(false);
  };

  const handleUpdateTransaction = () => {
    if (!transactionToEdit) return;
    setSheets(sheets.map(s => s.id === activeSheetId ? {
      ...s,
      transactions: s.transactions.map(t => t.id === transactionToEdit.id ? transactionToEdit : t)
    } : s));
    setIsEditDialogOpen(false);
    setTransactionToEdit(null);
  };

  const handleAddInlineEntry = () => {
    if (!inlineEntry.particulars) return;
    
    const entry: Transaction = {
      ...inlineEntry,
      id: Math.random().toString(36).substr(2, 9)
    };
    
    setSheets(sheets.map(s => s.id === activeSheetId ? { 
      ...s, 
      transactions: [...s.transactions, entry] 
    } : s));

    setInlineEntry({
      date: format(new Date(), 'yyyy-MM-dd'),
      particulars: '',
      debit: 0,
      credit: 0
    });
  };

  const removeTransaction = (id: string) => {
    setSheets(sheets.map(s => s.id === activeSheetId ? { 
      ...s, 
      transactions: s.transactions.filter(t => t.id !== id) 
    } : s));
  };

  const handleShare = async (formatType: 'pdf' | 'word') => {
    if (formatType === 'pdf') exportToPDF(activeSheet.transactions, totals, activeSheet.name);
    else exportToWord(activeSheet.transactions, totals, activeSheet.name);
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Ledger Report - ${activeSheet.name}`,
          text: `Check out the ${activeSheet.name} report.`,
          url: window.location.href
        });
      } catch (err) {
        console.log('Share failed', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 font-sans selection:bg-primary/20 flex flex-col">
      <div className="max-w-6xl mx-auto w-full space-y-4 md:space-y-8 flex-1 flex flex-col">
        
        {sheets.length > 0 && (
          <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="space-y-1"
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 md:p-3 bg-black rounded-xl md:rounded-2xl text-white shadow-lg shadow-black/20">
                  <TableIcon size={24} className="md:w-8 md:h-8" />
                </div>
                <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-foreground">MoneyFlow</h1>
              </div>
            </motion.div>

            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <div className="hidden md:flex flex-col items-end mr-2">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  user ? "text-success" : "text-secondary"
                )}>
                  {user ? 'Online Mode' : 'Offline Mode'}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {user ? 'Syncing to Cloud' : 'Saving to Device'}
                </span>
              </div>

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" className="rounded-xl md:rounded-2xl h-10 md:h-14 px-3 md:px-4 gap-2 border-2 border-primary/20 hover:bg-primary/5 transition-all" />}>
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon size={16} className="text-primary" />
                      )}
                    </div>
                    <span className="hidden sm:inline text-xs md:text-sm font-medium max-w-[100px] truncate">
                      {user.displayName || 'Account'}
                    </span>
                    <ChevronDown size={14} className="text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl p-2 min-w-[200px] shadow-2xl border-none bg-white">
                    <div className="px-3 py-2 border-b border-muted mb-1">
                      <p className="text-xs font-bold text-foreground truncate">{user.displayName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem onClick={handleSignOut} className="rounded-xl text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2">
                      <LogOut size={14} />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button 
                  onClick={handleSignIn}
                  variant="outline"
                  className="rounded-xl md:rounded-2xl h-10 md:h-14 px-4 md:px-6 gap-2 border-2 border-primary/20 hover:bg-primary/5 transition-all text-xs md:text-sm font-bold"
                >
                  <LogIn size={18} className="text-primary" />
                  <div className="flex flex-col items-start leading-tight">
                    <span>Sign In</span>
                    <span className="text-[8px] opacity-60 font-medium uppercase">Go Online</span>
                  </div>
                </Button>
              )}

              <Button 
                onClick={handleSave}
                disabled={isSaving || sheets.length === 0}
                className={cn(
                  "rounded-xl md:rounded-2xl h-10 md:h-14 px-3 md:px-6 gap-1 md:gap-2 shadow-md md:shadow-xl transition-all active:scale-95 flex-1 md:flex-none font-bold",
                  user ? "bg-success hover:bg-success/90 text-white" : "bg-secondary hover:bg-secondary/90 text-white"
                )}
              >
                {isSaving ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <Save size={18} />
                )}
                <div className="flex flex-col items-start leading-tight">
                  <span>{user ? 'Cloud Save' : 'Local Save'}</span>
                  {lastSaved ? (
                    <span className="text-[8px] opacity-70 font-medium uppercase tracking-tighter">Saved {lastSaved}</span>
                  ) : (
                    <span className="text-[8px] opacity-70 font-medium uppercase tracking-tighter">Not Saved</span>
                  )}
                </div>
              </Button>

              <Button 
                onClick={handleAddSheet}
                size="sm"
                className="rounded-xl md:rounded-2xl h-10 md:h-14 px-3 md:px-6 gap-1 md:gap-2 shadow-md md:shadow-xl hover:scale-105 transition-all active:scale-95 bg-primary text-primary-foreground text-xs md:text-base flex-1 md:flex-none"
              >
                <Plus size={16} className="md:w-5 md:h-5" />
                <span>Add Sheet</span>
              </Button>

              <Button 
                onClick={() => setIsHistoryDialogOpen(true)}
                variant="secondary"
                size="sm"
                className="rounded-xl md:rounded-2xl h-10 md:h-14 px-3 md:px-6 gap-1 md:gap-2 shadow-sm hover:scale-105 transition-all active:scale-95 text-xs md:text-base flex-1 md:flex-none"
              >
                <History size={16} className="md:w-5 md:h-5" />
                <span>History</span>
              </Button>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="rounded-xl md:rounded-2xl h-10 md:h-14 px-3 md:px-6 gap-1 md:gap-2 border-2 border-primary/20 hover:bg-primary/5 transition-all text-xs md:text-base flex-1" />}>
                    <Download size={16} className="md:w-5 md:h-5" />
                    <span>Export</span>
                    <ChevronDown size={14} className="opacity-50 md:w-4 md:h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl p-2 min-w-[180px] shadow-2xl border-none">
                    <DropdownMenuItem onClick={() => exportToPDF(activeSheet.transactions, totals, activeSheet.name)} className="rounded-xl gap-3 py-3 cursor-pointer">
                      <FileText size={18} className="text-red-500" />
                      <span>Download PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportToExcel(activeSheet.transactions, totals, activeSheet.name)} className="rounded-xl gap-3 py-3 cursor-pointer">
                      <FileSpreadsheet size={18} className="text-green-600" />
                      <span>Download Excel</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportToWord(activeSheet.transactions, totals, activeSheet.name)} className="rounded-xl gap-3 py-3 cursor-pointer">
                      <FileText size={18} className="text-blue-600" />
                      <span>Download Word</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="secondary" size="sm" className="rounded-xl md:rounded-2xl h-10 md:h-14 px-3 md:px-6 gap-1 md:gap-2 shadow-sm hover:scale-105 transition-all active:scale-95 text-xs md:text-base flex-1" />}>
                    <Share2 size={16} className="md:w-5 md:h-5" />
                    <span>Share</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl p-2 min-w-[180px] shadow-2xl border-none">
                    <DropdownMenuItem onClick={() => handleShare('pdf')} className="rounded-xl gap-3 py-3 cursor-pointer">
                      <FileText size={18} />
                      <span>Share as PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare('word')} className="rounded-xl gap-3 py-3 cursor-pointer">
                      <FileText size={18} />
                      <span>Share as Word</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>
        )}

        {sheets.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center space-y-12 text-center p-6"
            >
              <div className="flex flex-col items-center gap-8">
                <motion.div 
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="p-8 bg-primary rounded-[3rem] text-primary-foreground shadow-2xl shadow-primary/30"
                >
                  <TableIcon size={80} className="md:w-24 md:h-24" />
                </motion.div>
                <div className="space-y-3">
                  <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-foreground">MoneyFlow</h1>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6">
                <Button 
                  onClick={handleAddSheet}
                  size="lg" 
                  className="rounded-2xl md:rounded-[2.5rem] h-16 md:h-24 px-10 md:px-16 gap-4 md:gap-6 text-xl md:text-3xl shadow-2xl hover:scale-105 transition-all active:scale-95 bg-primary text-primary-foreground font-black w-full sm:w-auto"
                >
                  <Plus size={32} className="md:w-10 md:h-10" />
                  <span>Create Your First Sheet</span>
                </Button>

                <Button 
                  onClick={() => setIsHistoryDialogOpen(true)}
                  variant="secondary"
                  size="lg" 
                  className="rounded-2xl md:rounded-[2.5rem] h-16 md:h-24 px-10 md:px-16 gap-4 md:gap-6 text-xl md:text-3xl shadow-xl hover:scale-105 transition-all active:scale-95 w-full sm:w-auto font-bold"
                >
                  <History size={32} className="md:w-10 md:h-10" />
                  <span>History</span>
                </Button>
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Sheets Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <div className="flex items-center bg-surface-variant/30 p-1 rounded-2xl">
            {sheets.map(sheet => (
              <div key={sheet.id} className="relative group">
                <Button
                  variant={activeSheetId === sheet.id ? "default" : "ghost"}
                  onClick={() => setActiveSheetId(sheet.id)}
                  className={cn(
                    "rounded-xl px-4 py-2 h-10 gap-2 transition-all",
                    activeSheetId === sheet.id ? "shadow-md" : "hover:bg-primary/10"
                  )}
                >
                  <Layers size={16} />
                  <span>{sheet.name}</span>
                </Button>
                {activeSheetId === sheet.id && (
                  <div className="absolute -top-1 -right-1 flex gap-1">
                    <button 
                      onClick={() => {
                        setSheetToRename({ id: sheet.id, name: sheet.name });
                        setIsRenameDialogOpen(true);
                      }}
                      className="bg-white shadow-md rounded-full p-1 text-primary hover:scale-110 transition-transform"
                      title="Rename Sheet"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button 
                      onClick={() => handleDeleteSheet(sheet.id)}
                      className="bg-white shadow-md rounded-full p-1 text-destructive hover:scale-110 transition-transform"
                      title="Delete Sheet"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
          >
            <Card className="rounded-2xl md:rounded-[2rem] border-none shadow-lg md:shadow-xl bg-success text-success-foreground overflow-hidden cursor-default">
              <CardHeader className="p-4 md:pb-2">
                <CardDescription className="text-success-foreground/70 font-medium uppercase tracking-wider text-[10px] md:text-xs">Total Credit (+)</CardDescription>
                <CardTitle className="text-xl md:text-3xl font-bold flex items-center gap-2 text-[clamp(1rem,4vw,1.875rem)] whitespace-nowrap">
                  {formatRupee(totals.credit)}
                </CardTitle>
              </CardHeader>
              <div className="h-1 bg-white/10 w-full" />
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
          >
            <Card className="rounded-2xl md:rounded-[2rem] border-none shadow-lg md:shadow-xl bg-destructive text-destructive-foreground overflow-hidden group cursor-default">
              <CardHeader className="p-4 md:pb-2">
                <CardDescription className="text-destructive-foreground/70 font-medium uppercase tracking-wider text-[10px] md:text-xs">Total Debit (-)</CardDescription>
                <CardTitle className="text-xl md:text-3xl font-bold flex items-center gap-2 text-[clamp(1rem,4vw,1.875rem)] whitespace-nowrap">
                  {formatRupee(totals.debit)}
                </CardTitle>
              </CardHeader>
              <div className="h-1 bg-white/10 w-full" />
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02, y: -5 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
            className="sm:col-span-2 lg:col-span-1"
          >
            <Card className={cn(
              "rounded-2xl md:rounded-[2rem] border-none shadow-xl md:shadow-2xl overflow-hidden text-white cursor-default relative group",
              activeSheet?.adjustment?.colorPreference 
                ? `bg-${activeSheet.adjustment.colorPreference}` 
                : (totals.balance >= 0 ? "bg-primary" : "bg-destructive")
            )}>
              <CardHeader className="p-4 md:pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-white/70 font-medium uppercase tracking-wider text-[10px] md:text-xs">Net Balance</CardDescription>
                  <DropdownMenu onOpenChange={(open) => {
                    if (open && activeSheet) {
                      setAdjustmentInput(activeSheet.adjustment?.value?.toString() || '0');
                    }
                  }}>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-white/50 hover:text-white hover:bg-white/20" />}>
                      <Edit2 size={14} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-2xl p-3 min-w-[220px] shadow-2xl border-none bg-white text-foreground">
                      <div className="space-y-3" onKeyDown={(e) => e.stopPropagation()}>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Adjust Balance</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'none', label: 'None' },
                            { id: 'add', label: 'Add' },
                            { id: 'subtract', label: 'Sub' },
                            { id: 'divide', label: 'Div' },
                            { id: 'percent', label: '% Off' },
                            { id: 'override', label: 'Set' }
                          ].map(op => (
                            <Button
                              key={op.id}
                              variant={activeSheet?.adjustment?.type === op.id ? "default" : "outline"}
                              size="sm"
                              onClick={() => updateAdjustment({ 
                                type: op.id as any, 
                                value: activeSheet?.adjustment?.value || 0,
                                colorPreference: activeSheet?.adjustment?.colorPreference,
                                iconPreference: activeSheet?.adjustment?.iconPreference
                              })}
                              className="text-[10px] h-8 rounded-lg"
                            >
                              {op.label}
                            </Button>
                          ))}
                        </div>
                        {activeSheet?.adjustment?.type !== 'none' && (
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase">Enter Adjustment Value</Label>
                            <Input 
                              type="text"
                              inputMode="decimal"
                              value={adjustmentInput}
                              onChange={(e) => handleAdjustmentInputChange(e.target.value)}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="h-10 text-base rounded-xl border-2 border-primary/20 focus:border-primary font-mono"
                              placeholder="0.00"
                            />
                            <p className="text-[9px] text-muted-foreground italic">Supports decimals & manual entry</p>
                          </div>
                        )}
                        {activeSheet?.adjustment?.type !== 'none' && (
                          <div className="space-y-2 pt-2 border-t border-muted">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Icon Preference</p>
                            <div className="grid grid-cols-5 gap-1">
                              {[
                                { id: 'none', label: 'None', icon: X },
                                { id: 'up', label: 'Up', icon: ArrowUpRight },
                                { id: 'down', label: 'Down', icon: ArrowDownLeft },
                                { id: 'dollar', label: 'INR', icon: IndianRupee },
                                { id: 'wallet', label: 'Wallet', icon: Layers }
                              ].map(ip => (
                                <button
                                  key={ip.id}
                                  onClick={() => updateAdjustment({ 
                                    ...activeSheet?.adjustment!, 
                                    iconPreference: ip.id as any 
                                  })}
                                  className={cn(
                                    "h-8 rounded-lg border-2 transition-all flex items-center justify-center bg-muted/50",
                                    activeSheet?.adjustment?.iconPreference === ip.id ? "border-primary scale-110 shadow-md text-primary" : "border-transparent text-muted-foreground"
                                  )}
                                  title={ip.label}
                                >
                                  <ip.icon size={12} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {activeSheet?.adjustment?.type !== 'none' && (
                          <div className="space-y-2 pt-2 border-t border-muted">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Card Color Preference</p>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { id: 'primary', label: 'Theme', color: 'bg-primary' },
                                { id: 'success', label: 'Green', color: 'bg-success' },
                                { id: 'destructive', label: 'Red', color: 'bg-destructive' }
                              ].map(cp => (
                                <button
                                  key={cp.id}
                                  onClick={() => updateAdjustment({ 
                                    ...activeSheet?.adjustment!, 
                                    colorPreference: cp.id as any 
                                  })}
                                  className={cn(
                                    "h-8 rounded-lg border-2 transition-all flex items-center justify-center text-[8px] font-bold text-white",
                                    cp.color,
                                    activeSheet?.adjustment?.colorPreference === cp.id ? "border-foreground scale-110 shadow-md" : "border-transparent opacity-70"
                                  )}
                                >
                                  {cp.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {activeSheet?.adjustment?.type !== 'none' && (
                          <div className="pt-2 border-t border-muted">
                            <p className="text-[10px] text-muted-foreground">Original: {formatRupee(totals.rawBalance)}</p>
                          </div>
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="text-xl md:text-3xl font-bold flex items-center gap-2 text-[clamp(1rem,4vw,1.875rem)] whitespace-nowrap">
                  {activeSheet?.adjustment?.iconPreference === 'up' && <ArrowUpRight className="w-5 h-5 md:w-6 md:h-6" />}
                  {activeSheet?.adjustment?.iconPreference === 'down' && <ArrowDownLeft className="w-5 h-5 md:w-6 md:h-6" />}
                  {activeSheet?.adjustment?.iconPreference === 'dollar' && <IndianRupee className="w-5 h-5 md:w-6 md:h-6" />}
                  {activeSheet?.adjustment?.iconPreference === 'wallet' && <Layers className="w-5 h-5 md:w-6 md:h-6" />}
                  {formatRupee(totals.balance).replace('INR', '').trim()}
                  {totals.adjustmentAmount !== 0 && (
                    <span className="text-[10px] md:text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Adjusted</span>
                  )}
                </CardTitle>
                {totals.adjustmentAmount !== 0 && (
                  <div className="text-[10px] md:text-xs text-white/70 font-medium mt-1 flex items-center gap-1">
                    <span>{totals.adjustmentAmount > 0 ? 'Added' : 'Deducted'}:</span>
                    <span className="font-bold">{formatRupee(Math.abs(totals.adjustmentAmount))}</span>
                    {activeSheet?.adjustment?.type === 'percent' && (
                      <span className="opacity-60">({activeSheet.adjustment.value}%)</span>
                    )}
                  </div>
                )}
              </CardHeader>
              <div className="h-1 bg-white/20 w-full" />
            </Card>
          </motion.div>
        </div>

        {/* Main Table Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: 'spring', damping: 25 }}
          className="space-y-6"
        >
          {/* Add Entry Section (Now at Top) */}
          <Card className="rounded-2xl md:rounded-[2rem] border-none shadow-xl md:shadow-2xl overflow-hidden bg-primary/5">
            <CardHeader className="p-4 md:p-6 pb-0">
              <CardTitle className="text-lg md:text-2xl font-bold text-primary flex items-center gap-2">
                <Plus className="bg-primary text-white rounded-lg p-1" size={24} />
                Add New Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</Label>
                  <Input 
                    type="date" 
                    value={inlineEntry.date}
                    onChange={(e) => setInlineEntry({...inlineEntry, date: e.target.value})}
                    className="rounded-xl border-muted bg-white h-12"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Particulars</Label>
                  <Input 
                    placeholder="What is this for?" 
                    value={inlineEntry.particulars}
                    onChange={(e) => setInlineEntry({...inlineEntry, particulars: e.target.value})}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddInlineEntry()}
                    className="rounded-xl border-muted bg-white h-12"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 md:col-span-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Credit (+)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">₹</span>
                      <Input 
                        type="number" 
                        step="any"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={inlineEntry.credit || ''}
                        onChange={(e) => setInlineEntry({...inlineEntry, credit: parseFloat(e.target.value) || 0})}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddInlineEntry()}
                        className="rounded-xl border-muted bg-white h-12 pl-7 text-right text-base"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Debit (-)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">₹</span>
                      <Input 
                        type="number" 
                        step="any"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={inlineEntry.debit || ''}
                        onChange={(e) => setInlineEntry({...inlineEntry, debit: parseFloat(e.target.value) || 0})}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddInlineEntry()}
                        className="rounded-xl border-muted bg-white h-12 pl-7 text-right text-base"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:col-span-4 mt-2">
                  <Button 
                    onClick={handleAddInlineEntry}
                    disabled={!inlineEntry.particulars}
                    className="w-full rounded-xl h-14 text-lg font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all gap-2"
                  >
                    <Save size={20} />
                    Add Transaction to Ledger
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ledger Table Section (Now at Bottom) */}
          <Card className="rounded-2xl md:rounded-[2.5rem] border-none shadow-xl md:shadow-2xl overflow-hidden bg-white">
            <div className="p-4 md:p-6 border-b border-muted/50 flex items-center justify-between bg-surface-variant/30">
              <h2 className="text-base md:text-xl font-semibold text-foreground flex items-center gap-2 truncate">
                <CalendarIcon size={18} className="text-primary shrink-0" />
                <span className="truncate">{activeSheet.name}</span>
              </h2>
              <span className="text-[10px] md:text-sm text-muted-foreground font-medium bg-white px-2 md:px-3 py-0.5 md:py-1 rounded-full shadow-sm shrink-0">
                {activeSheet.transactions.length} Entries
              </span>
            </div>
            <CardContent className="p-0">
              <div className="overflow-x-auto no-scrollbar touch-pan-x overscroll-x-contain">
                <Table>
                  <TableHeader className="bg-surface-variant/10">
                    <TableRow className="hover:bg-transparent border-muted/30">
                      <TableHead className="w-[120px] md:w-[180px] font-bold text-foreground py-3 md:py-6 text-xs md:text-base">Date</TableHead>
                      <TableHead className="font-bold text-foreground py-3 md:py-6 text-xs md:text-base">Particulars</TableHead>
                      <TableHead className="text-right font-bold text-foreground py-3 md:py-6 text-xs md:text-base">Credit (+)</TableHead>
                      <TableHead className="text-right font-bold text-foreground py-3 md:py-6 text-xs md:text-base">Debit (-)</TableHead>
                      <TableHead className="w-[80px] md:w-[120px] py-3 md:py-6"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {activeSheet.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-20 text-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Archive className="opacity-20" size={48} />
                              <p>No transactions yet. Add your first entry above.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        activeSheet.transactions.map((t) => (
                          <motion.tr
                            key={t.id}
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                            className="group border-muted/20 hover:bg-primary/5 transition-colors"
                          >
                            <TableCell className="font-medium py-3 md:py-5 text-muted-foreground text-[10px] md:text-sm whitespace-nowrap">
                              {format(new Date(t.date), 'MMM dd, yyyy')}
                            </TableCell>
                            <TableCell className="font-semibold text-foreground py-3 md:py-5 text-xs md:text-base">
                              <div className="max-w-[150px] md:max-w-[300px] break-words line-clamp-2 md:line-clamp-none" title={t.particulars}>
                                {t.particulars}
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-3 md:py-5 text-success font-bold text-[clamp(0.7rem,2vw,1rem)] whitespace-nowrap">
                              {t.credit > 0 ? formatRupee(t.credit).replace('₹', '') : '-'}
                            </TableCell>
                            <TableCell className="text-right py-3 md:py-5 text-destructive font-bold text-[clamp(0.7rem,2vw,1rem)] whitespace-nowrap">
                              {t.debit > 0 ? formatRupee(t.debit).replace('₹', '') : '-'}
                            </TableCell>
                            <TableCell className="py-3 md:py-5">
                              <div className="flex items-center gap-1 md:gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => {
                                    setTransactionToEdit(t);
                                    setIsEditDialogOpen(true);
                                  }}
                                  className="md:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg md:rounded-xl h-8 w-8 md:h-10 md:w-10"
                                >
                                  <Edit2 size={14} className="md:w-[18px] md:h-[18px]" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => removeTransaction(t.id)}
                                  className="md:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg md:rounded-xl h-8 w-8 md:h-10 md:w-10"
                                >
                                  <Trash2 size={14} className="md:w-[18px] md:h-[18px]" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </TableBody>
                  <TableFooter className="bg-surface-variant/20 border-t-2 border-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2} className="py-4 md:py-8 text-sm md:text-xl font-bold text-foreground">Total Balance</TableCell>
                      <TableCell className="text-right py-4 md:py-8 text-sm md:text-2xl font-black text-success text-[clamp(0.8rem,3vw,1.5rem)] whitespace-nowrap">
                        {formatRupee(totals.credit)}
                      </TableCell>
                      <TableCell className="text-right py-4 md:py-8 text-sm md:text-2xl font-black text-destructive text-[clamp(0.8rem,3vw,1.5rem)] whitespace-nowrap">
                        {formatRupee(totals.debit)}
                      </TableCell>
                      <TableCell className="py-4 md:py-8"></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
          </>
        )}

        {/* Edit Transaction Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="rounded-3xl border-none shadow-2xl max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Transaction</DialogTitle>
              <DialogDescription>Update the details of this transaction.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</Label>
                <Input 
                  type="date" 
                  value={transactionToEdit?.date || ''} 
                  onChange={(e) => setTransactionToEdit(prev => prev ? {...prev, date: e.target.value} : null)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Particulars</Label>
                <Input 
                  value={transactionToEdit?.particulars || ''} 
                  onChange={(e) => setTransactionToEdit(prev => prev ? {...prev, particulars: e.target.value} : null)}
                  className="rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Debit (-)</Label>
                  <Input 
                    type="number" 
                    step="any"
                    inputMode="decimal"
                    value={transactionToEdit?.debit || 0} 
                    onChange={(e) => setTransactionToEdit(prev => prev ? {...prev, debit: parseFloat(e.target.value) || 0} : null)}
                    className="rounded-xl text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Credit (+)</Label>
                  <Input 
                    type="number" 
                    step="any"
                    inputMode="decimal"
                    value={transactionToEdit?.credit || 0} 
                    onChange={(e) => setTransactionToEdit(prev => prev ? {...prev, credit: parseFloat(e.target.value) || 0} : null)}
                    className="rounded-xl text-base"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleUpdateTransaction} className="rounded-xl">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent className="rounded-3xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle>Rename Sheet</DialogTitle>
              <DialogDescription>Enter a new name for this accounting sheet.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input 
                value={sheetToRename?.name || ''} 
                onChange={(e) => setSheetToRename(prev => prev ? {...prev, name: e.target.value} : null)}
                className="rounded-xl text-base"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsRenameDialogOpen(false)} className="rounded-xl">Cancel</Button>
              <Button onClick={handleRenameSheet} className="rounded-xl">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="rounded-3xl border-none shadow-2xl max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="text-primary" />
                Saved Ledger History
              </DialogTitle>
              <DialogDescription>Restore previously saved accounting sheets.</DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-[60vh] md:max-h-[400px] overflow-y-auto space-y-3 pr-2">
              {savedSheets.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Archive className="mx-auto mb-2 opacity-20" size={48} />
                  <p>No saved history yet.</p>
                </div>
              ) : (
                savedSheets.map((sheet, idx) => (
                  <div key={`${sheet.id}-${idx}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-muted/30 rounded-2xl hover:bg-muted/50 transition-colors group gap-3">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">
                        <FileText className="text-primary" size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">{sheet.name}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1">
                          <Clock size={12} />
                          {sheet.savedAt ? format(new Date(sheet.savedAt), 'MMM dd, yyyy HH:mm') : 'Unknown Date'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => restoreFromHistory(sheet)}
                        className="rounded-xl h-8 md:h-10 gap-1 md:gap-2 hover:bg-primary hover:text-primary-foreground text-xs md:text-sm"
                      >
                        <Plus size={14} />
                        Restore
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => deleteFromHistory(sheet.id)}
                        className="rounded-xl h-8 w-8 md:h-10 md:w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsHistoryDialogOpen(false)} className="rounded-xl">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Footer Info */}
        <footer className="pt-8 pb-12 text-center border-t border-muted/30">
        </footer>
      </div>
    </div>
  );
}

