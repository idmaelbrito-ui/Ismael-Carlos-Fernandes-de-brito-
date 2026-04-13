/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db, messaging, getToken, onMessage } from './firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';
import { 
  LogOut, 
  Plus, 
  Hammer, 
  ClipboardList, 
  CheckCircle2, 
  Clock, 
  Camera, 
  DollarSign, 
  User as UserIcon,
  LayoutDashboard,
  Image as ImageIcon,
  MapPin,
  Phone,
  MessageSquare,
  Drill,
  X as XIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'assembler';
  status: 'pending' | 'approved' | 'rejected';
  fcmToken?: string;
}

interface Job {
  id: string;
  title: string;
  description?: string;
  value: number;
  status: 'pending' | 'in_progress' | 'completed';
  clientName: string;
  whatsapp: string;
  address: string;
  photos?: string[];
  finishedPhoto?: string;
  assignedTo?: string;
  createdAt: any;
  updatedAt?: any;
}

export default function App() {
  console.log("App mounting...");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assemblers, setAssemblers] = useState<UserProfile[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [isNewJobDialogOpen, setIsNewJobDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // FCM Setup
  useEffect(() => {
    if (!user || !messaging) return;

    const setupNotifications = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, {
            // Note: You need to generate a VAPID key in Firebase Console -> Project Settings -> Cloud Messaging
            // vapidKey: 'YOUR_VAPID_KEY'
          });
          
          if (token) {
            console.log('FCM Token:', token);
            await updateDoc(doc(db, 'users', user.uid), {
              fcmToken: token
            });
          }
        }
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };

    setupNotifications();

    const unsubscribeOnMessage = onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);
      if (payload.notification) {
        toast(payload.notification.title, {
          description: payload.notification.body,
        });
      }
    });

    return () => unsubscribeOnMessage();
  }, [user]);

  // Jobs Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // New user - default to assembler unless it's the specific admin email
          const isAdmin = firebaseUser.email === 'idmaelbrito@gmail.com';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Usuário',
            email: firebaseUser.email || '',
            role: isAdmin ? 'admin' : 'assembler',
            status: isAdmin ? 'approved' : 'pending',
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Jobs Listener
  useEffect(() => {
    if (!user || !profile) return;

    const jobsQuery = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Job[];
      setJobs(jobsData);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Erro ao carregar serviços");
    });

    return () => unsubscribe();
  }, [user, profile]);

  // Assemblers Listener
  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const assemblersQuery = query(collection(db, 'users'), where('role', '==', 'assembler'), where('status', '==', 'approved'));
    const unsubscribe = onSnapshot(assemblersQuery, (snapshot) => {
      const assemblersData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAssemblers(assemblersData);
    });

    return () => unsubscribe();
  }, [profile]);

  // Pending Users Listener
  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const pendingQuery = query(collection(db, 'users'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(pendingQuery, (snapshot) => {
      const pendingData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setPendingUsers(pendingData);
    });

    return () => unsubscribe();
  }, [profile]);

  const deleteJob = async (jobId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este serviço?")) return;
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'jobs', jobId));
      toast.success("Serviço excluído com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao excluir serviço");
    }
  };

  const approveUser = async (userUid: string) => {
    try {
      await updateDoc(doc(db, 'users', userUid), {
        status: 'approved'
      });
      toast.success("Usuário aprovado!");
      // Notify the user
      await sendNotification(userUid, "Conta Aprovada", "Sua conta na RM Montagem foi aprovada! Agora você pode aceitar serviços.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao aprovar usuário");
    }
  };

  const rejectUser = async (userUid: string) => {
    try {
      await updateDoc(doc(db, 'users', userUid), {
        status: 'rejected'
      });
      toast.success("Usuário rejeitado");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao rejeitar usuário");
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success("Login realizado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao fazer login");
    }
  };

  const handleLogout = () => signOut(auth);

  const sendNotification = async (userId: string, title: string, body: string, data?: any) => {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title, body, data })
      });
    } catch (error) {
      console.error('Error calling notify API:', error);
    }
  };

  const notifyAdmins = async (title: string, body: string, data?: any) => {
    try {
      await fetch('/api/notify-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, data })
      });
    } catch (error) {
      console.error('Error calling notify-admins API:', error);
    }
  };

  const notifyAssemblers = async (title: string, body: string, data?: any) => {
    try {
      await fetch('/api/notify-assemblers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, data })
      });
    } catch (error) {
      console.error('Error calling notify-assemblers API:', error);
    }
  };

  const createJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const value = parseFloat(formData.get('value') as string);
    const clientName = formData.get('clientName') as string;
    const whatsapp = formData.get('whatsapp') as string;
    const address = formData.get('address') as string;
    const description = formData.get('description') as string;
    const photoUrl = formData.get('photoUrl') as string;
    const assignedTo = formData.get('assignedTo') as string;

    try {
      const jobRef = await addDoc(collection(db, 'jobs'), {
        title,
        value,
        clientName,
        whatsapp,
        address,
        description,
        status: assignedTo ? 'in_progress' : 'pending',
        photos: photoUrl ? [photoUrl] : [],
        assignedTo: assignedTo || null,
        createdAt: serverTimestamp(),
      });

      const jobId = jobRef.id;

      // Notify assemblers about new job
      if (assignedTo) {
        await sendNotification(
          assignedTo,
          "Novo Serviço Atribuído",
          `Você recebeu um novo serviço: ${title}`,
          { jobId, type: 'assignment' }
        );
      } else {
        await notifyAssemblers(
          "Novo Serviço Disponível",
          `Um novo serviço de montagem foi cadastrado: ${title}`,
          { jobId, type: 'new_job' }
        );
      }

      setIsNewJobDialogOpen(false);
      toast.success("Serviço criado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar serviço");
    }
  };

  const acceptJob = async (jobId: string) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), {
        status: 'in_progress',
        assignedTo: user?.uid,
        updatedAt: serverTimestamp(),
      });
      
      // Notify assembler (self, but logic is there)
      // In a real scenario, the admin might assign it, but here the assembler accepts it.
      // If an admin assigned it, we would notify the assembler.
      
      toast.success("Serviço aceito!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao aceitar serviço");
    }
  };

  const finishJob = async (jobId: string, finishedPhoto: string) => {
    try {
      const job = jobs.find(j => j.id === jobId);
      await updateDoc(doc(db, 'jobs', jobId), {
        status: 'completed',
        finishedPhoto,
        updatedAt: serverTimestamp(),
      });
      
      // Notify admins
      await notifyAdmins(
        "Serviço Concluído",
        `O montador ${profile?.name} finalizou o serviço: ${job?.title}`
      );

      toast.success("Serviço finalizado!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao finalizar serviço");
    }
  };

  const updateJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingJob) return;

    const formData = new FormData(e.currentTarget);
    const assignedTo = formData.get('assignedTo') as string;
    const updates: any = {
      title: formData.get('title') as string,
      value: parseFloat(formData.get('value') as string),
      clientName: formData.get('clientName') as string,
      whatsapp: formData.get('whatsapp') as string,
      address: formData.get('address') as string,
      description: formData.get('description') as string,
      assignedTo: assignedTo || null,
      updatedAt: serverTimestamp(),
    };

    if (assignedTo && editingJob.status === 'pending') {
      updates.status = 'in_progress';
    }

    try {
      await updateDoc(doc(db, 'jobs', editingJob.id), updates);
      
      // Notify assigned assembler if exists
      if (assignedTo && assignedTo !== editingJob.assignedTo) {
        await sendNotification(
          assignedTo,
          "Novo Serviço Atribuído",
          `Um serviço foi atribuído a você: ${updates.title}`,
          { jobId: editingJob.id, type: 'assignment' }
        );
      } else if (editingJob.assignedTo) {
        await sendNotification(
          editingJob.assignedTo,
          "Atualização de Serviço",
          `O serviço "${updates.title}" foi atualizado pelo administrador.`,
          { jobId: editingJob.id, type: 'update' }
        );
      }

      setEditingJob(null);
      toast.success("Serviço atualizado!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar serviço");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            duration: 0.8,
            repeat: Infinity,
            repeatType: "reverse"
          }}
          className="relative flex flex-col items-center"
        >
          <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl mb-4">
            <Drill className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">RM Montagem</h2>
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="mt-8 w-8 h-8 border-4 border-zinc-100 border-t-blue-600 rounded-full"
          />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center space-y-8"
        >
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-blue-600 text-white shadow-lg mb-4">
              <Drill className="w-12 h-12" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900">RM Montagem</h1>
            <p className="text-zinc-500">Gerenciamento profissional para montadores de móveis</p>
          </div>
          
          <Card className="border-zinc-200 shadow-xl shadow-zinc-200/50">
            <CardHeader>
              <CardTitle>Bem-vindo</CardTitle>
              <CardDescription>Acesse sua conta para gerenciar seus serviços</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleLogin} className="w-full h-12 text-lg bg-zinc-900 hover:bg-zinc-800">
                Entrar com Google
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (profile?.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 p-4">
        <Card className="w-full max-w-md border-zinc-200 shadow-xl text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                <Clock className="w-8 h-8" />
              </div>
            </div>
            <CardTitle>Aguardando Aprovação</CardTitle>
            <CardDescription>
              Sua conta foi criada com sucesso, mas precisa ser aprovada por um administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-500">
              Você receberá uma notificação assim que seu acesso for liberado.
            </p>
            <Button variant="outline" onClick={handleLogout} className="w-full">
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (profile?.status === 'rejected') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 p-4">
        <Card className="w-full max-w-md border-zinc-200 shadow-xl text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                <XIcon className="w-8 h-8" />
              </div>
            </div>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>
              Infelizmente sua solicitação de acesso não foi aprovada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleLogout} className="w-full">
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
              <Drill className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:inline-block">RM Montagem</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-zinc-900">{profile?.name}</span>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider h-4">
                {profile?.role === 'admin' ? 'Administrador' : 'Montador'}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-zinc-500 hover:text-red-600">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">
        {profile?.role === 'admin' ? (
          <AdminDashboard 
            jobs={jobs} 
            assemblers={assemblers}
            pendingUsers={pendingUsers}
            approveUser={approveUser}
            rejectUser={rejectUser}
            createJob={createJob} 
            deleteJob={deleteJob}
            isOpen={isNewJobDialogOpen} 
            setIsOpen={setIsNewJobDialogOpen}
            editingJob={editingJob}
            setEditingJob={setEditingJob}
            updateJob={updateJob}
          />
        ) : (
          <AssemblerDashboard 
            jobs={jobs} 
            userUid={user.uid} 
            acceptJob={acceptJob} 
            finishJob={finishJob} 
          />
        )}
      </main>
    </div>
  );
}

function AdminDashboard({ jobs, assemblers, pendingUsers, approveUser, rejectUser, createJob, deleteJob, isOpen, setIsOpen, editingJob, setEditingJob, updateJob }: any) {
  const stats = {
    total: jobs.length,
    pending: jobs.filter((j: any) => j.status === 'pending').length,
    inProgress: jobs.filter((j: any) => j.status === 'in_progress').length,
    completed: jobs.filter((j: any) => j.status === 'completed').length,
    totalValue: jobs.reduce((acc: number, j: any) => acc + j.value, 0)
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total" value={stats.total} icon={<ClipboardList className="w-4 h-4" />} />
        <StatCard title="Pendentes" value={stats.pending} icon={<Clock className="w-4 h-4" />} color="text-amber-600" />
        <StatCard title="Em Curso" value={stats.inProgress} icon={<Drill className="w-4 h-4" />} color="text-blue-600" />
        <StatCard title="Concluídos" value={stats.completed} icon={<CheckCircle2 className="w-4 h-4" />} color="text-emerald-600" />
      </div>

      {pendingUsers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700">
              <UserIcon className="w-4 h-4" /> Novos Cadastros Aguardando Aprovação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingUsers.map((u: UserProfile) => (
              <div key={u.uid} className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-100">
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{u.name}</span>
                  <span className="text-xs text-zinc-500">{u.email}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs border-amber-200 hover:bg-amber-100" onClick={() => approveUser(u.uid)}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-red-600 hover:bg-red-50" onClick={() => rejectUser(u.uid)}>
                    Recusar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-900">Serviços</h2>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger render={<Button className="bg-zinc-900 hover:bg-zinc-800"><Plus className="w-4 h-4 mr-2" /> Novo Serviço</Button>} />
          <DialogContent>
            <form onSubmit={createJob}>
              <DialogHeader>
                <DialogTitle>Criar Novo Serviço</DialogTitle>
                <DialogDescription>Preencha os detalhes do móvel para montagem.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título do Móvel</Label>
                  <Input id="title" name="title" placeholder="Ex: Guarda-roupa 6 portas" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="clientName">Nome do Cliente</Label>
                    <Input id="clientName" name="clientName" placeholder="Nome completo" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input id="whatsapp" name="whatsapp" placeholder="(00) 00000-0000" required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Endereço Completo</Label>
                  <Input id="address" name="address" placeholder="Rua, número, bairro, cidade..." required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="value">Valor (R$)</Label>
                  <Input id="value" name="value" type="number" step="0.01" placeholder="0.00" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição / Observações</Label>
                  <Input id="description" name="description" placeholder="Detalhes adicionais..." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="photoUrl">URL da Foto (Opcional)</Label>
                  <Input id="photoUrl" name="photoUrl" placeholder="https://..." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="assignedTo">Atribuir a Montador (Opcional)</Label>
                  <select 
                    id="assignedTo" 
                    name="assignedTo" 
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Serviço Aberto (Disponível para todos)</option>
                    {assemblers.map((a: any) => (
                      <option key={a.uid} value={a.uid}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full bg-zinc-900">Salvar Serviço</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job: Job) => (
          <JobCard key={job.id} job={job} isAdmin onEdit={() => setEditingJob(job)} onDelete={() => deleteJob(job.id)} />
        ))}
      </div>

      {/* Edit Job Dialog */}
      <Dialog open={!!editingJob} onOpenChange={(open) => !open && setEditingJob(null)}>
        <DialogContent>
          <form onSubmit={updateJob}>
            <DialogHeader>
              <DialogTitle>Editar Serviço</DialogTitle>
              <DialogDescription>Atualize os detalhes do serviço.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Título do Móvel</Label>
                <Input id="edit-title" name="title" defaultValue={editingJob?.title} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-clientName">Nome do Cliente</Label>
                  <Input id="edit-clientName" name="clientName" defaultValue={editingJob?.clientName} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-whatsapp">WhatsApp</Label>
                  <Input id="edit-whatsapp" name="whatsapp" defaultValue={editingJob?.whatsapp} required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-address">Endereço Completo</Label>
                <Input id="edit-address" name="address" defaultValue={editingJob?.address} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-value">Valor (R$)</Label>
                <Input id="edit-value" name="value" type="number" step="0.01" defaultValue={editingJob?.value} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Descrição / Observações</Label>
                <Input id="edit-description" name="description" defaultValue={editingJob?.description} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-assignedTo">Atribuir a Montador</Label>
                <select 
                  id="edit-assignedTo" 
                  name="assignedTo" 
                  defaultValue={editingJob?.assignedTo || ""}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Serviço Aberto (Disponível para todos)</option>
                  {assemblers.map((a: any) => (
                    <option key={a.uid} value={a.uid}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full bg-zinc-900">Salvar Alterações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssemblerDashboard({ jobs, userUid, acceptJob, finishJob }: any) {
  return (
    <Tabs defaultValue="available" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-8">
        <TabsTrigger value="available">Disponíveis</TabsTrigger>
        <TabsTrigger value="my-jobs">Meus Serviços</TabsTrigger>
      </TabsList>
      
      <TabsContent value="available" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.filter((j: any) => j.status === 'pending').map((job: Job) => (
            <JobCard key={job.id} job={job} onAction={() => acceptJob(job.id)} actionLabel="Aceitar Serviço" />
          ))}
          {jobs.filter((j: any) => j.status === 'pending').length === 0 && (
            <div className="col-span-full text-center py-12 text-zinc-500">
              Nenhum serviço disponível no momento.
            </div>
          )}
        </div>
      </TabsContent>
      
      <TabsContent value="my-jobs" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.filter((j: any) => j.assignedTo === userUid).map((job: Job) => (
            <JobCard 
              key={job.id} 
              job={job} 
              onAction={(photo: string) => finishJob(job.id, photo)} 
              actionLabel={job.status === 'in_progress' ? "Finalizar" : undefined}
            />
          ))}
          {jobs.filter((j: any) => j.assignedTo === userUid).length === 0 && (
            <div className="col-span-full text-center py-12 text-zinc-500">
              Você ainda não aceitou nenhum serviço.
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function StatCard({ title, value, icon, color = "text-zinc-500" }: any) {
  return (
    <Card className="border-zinc-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</CardTitle>
        <div className={color}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function JobCard({ job, onAction, actionLabel, isAdmin, onEdit, onDelete }: { job: Job, onAction?: any, actionLabel?: string, isAdmin?: boolean, onEdit?: () => void, onDelete?: () => void, key?: string }) {
  const [finishPhoto, setFinishPhoto] = useState("");

  const statusConfig = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Clock className="w-3 h-3" /> },
    in_progress: { label: 'Em Curso', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Drill className="w-3 h-3" /> },
    completed: { label: 'Concluído', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  };

  const config = statusConfig[job.status];

  return (
    <Card className="overflow-hidden border-zinc-200 hover:shadow-md transition-shadow">
      <div className="aspect-video bg-zinc-100 relative overflow-hidden">
        {job.status === 'completed' && job.finishedPhoto ? (
          <img 
            src={job.finishedPhoto} 
            alt="Finalizado" 
            className="object-cover w-full h-full"
            referrerPolicy="no-referrer"
          />
        ) : job.photos && job.photos.length > 0 ? (
          <img 
            src={job.photos[0]} 
            alt="Móvel" 
            className="object-cover w-full h-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400">
            <ImageIcon className="w-12 h-12 opacity-20" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge className={`${config.color} border flex items-center gap-1`}>
            {config.icon} {config.label}
          </Badge>
        </div>
      </div>
      
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg line-clamp-1">{job.title}</CardTitle>
          <div className="flex flex-col items-end">
            <span className="font-bold text-zinc-900 whitespace-nowrap">
              R$ {job.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            {isAdmin && job.status !== 'completed' && (
              <div className="flex gap-1 mt-1">
                <Button variant="ghost" size="xs" onClick={onEdit} className="h-6 px-2 text-[10px]">
                  Editar
                </Button>
                <Button variant="ghost" size="xs" onClick={onDelete} className="h-6 px-2 text-[10px] text-red-600 hover:bg-red-50">
                  Excluir
                </Button>
              </div>
            )}
            {isAdmin && job.status === 'completed' && (
              <Button variant="ghost" size="xs" onClick={onDelete} className="h-6 px-2 text-[10px] text-red-600 hover:bg-red-50 mt-1">
                Excluir
              </Button>
            )}
          </div>
        </div>
        {job.description && (
          <CardDescription className="line-clamp-2 text-xs mt-1">
            {job.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-0 text-xs text-zinc-500 space-y-2">
        <div className="flex items-center gap-1 font-medium text-zinc-900">
          <UserIcon className="w-3 h-3" />
          {job.clientName}
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {job.address}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {job.whatsapp}
          </div>
          <a 
            href={`https://wa.me/${(job.whatsapp || '').replace(/\D/g, '')}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3" /> WhatsApp
          </a>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {job.createdAt?.seconds 
            ? new Date(job.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
            : '...'}
        </div>
        {job.assignedTo && (
          <div className="flex items-center gap-1">
            <UserIcon className="w-3 h-3" />
            <span className="text-blue-600 font-medium">Atribuído a montador</span>
          </div>
        )}
      </CardContent>

      {onAction && job.status !== 'completed' && (
        <CardFooter className="p-4 pt-0">
          {job.status === 'in_progress' ? (
            <Dialog>
              <DialogTrigger render={<Button className="w-full bg-zinc-900">{actionLabel}</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Finalizar Serviço</DialogTitle>
                  <DialogDescription>Insira a URL da foto do móvel montado para concluir.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="finishPhoto">URL da Foto do Móvel Pronto</Label>
                  <Input 
                    id="finishPhoto" 
                    placeholder="https://..." 
                    value={finishPhoto}
                    onChange={(e) => setFinishPhoto(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button 
                    onClick={() => onAction(finishPhoto)} 
                    disabled={!finishPhoto}
                    className="w-full bg-zinc-900"
                  >
                    Confirmar Conclusão
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Button onClick={onAction} className="w-full bg-zinc-900">{actionLabel}</Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
