<template>
  <div class="user-page">
    <div class="page-header"><h2>用户管理</h2><el-button type="primary" @click="openAdd">创建用户</el-button></div>
    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="username" label="用户名" width="200" />
        <el-table-column label="创建时间" width="200"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='active'?'success':'danger'">{{ row.status==='active'?'正常':'禁用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{row}">
            <el-button size="small" @click="openResetPwd(row)">重置密码</el-button>
            <el-popconfirm title="确定删除？" @confirm="doDelete(row)"><template #reference><el-button size="small" type="danger">删除</el-button></template></el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog title="创建用户" v-model="addVisible" width="420px">
      <el-form :model="addForm" ref="addFormRef" label-width="80px">
        <el-form-item label="用户名"><el-input v-model="addForm.username" placeholder="至少3个字符" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="addForm.password" type="password" show-password placeholder="至少6个字符" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="addVisible=false">取消</el-button><el-button type="primary" @click="doCreate" :loading="saving">确认创建</el-button></template>
    </el-dialog>

    <el-dialog title="重置密码" v-model="pwdVisible" width="420px">
      <el-form label-width="80px">
        <el-form-item label="用户名"><el-input :value="resetUser?.username" disabled /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="newPwd" type="password" show-password placeholder="至少6个字符" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="pwdVisible=false">取消</el-button><el-button type="primary" @click="doResetPwd" :loading="saving">确认</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserList, createUser, resetUserPassword, deleteUser } from '@/api'

const loading=ref(false),saving=ref(false),list=ref([])
const loadList=async()=>{loading.value=true;try{const res=await getUserList();console.log('getUserList response:', res);list.value=(res && res.data && res.data.list) || (res && res.list) || []}catch(e){console.error(e)}loading.value=false}
loadList()

const addVisible=ref(false),addFormRef=ref(null),addForm=reactive({username:'',password:''})
const openAdd=()=>{addForm.username='';addForm.password='';addVisible.value=true}
const doCreate=async()=>{if(!addForm.username||addForm.username.length<3){ElMessage.warning('用户名至少3个字符');return};if(!addForm.password||addForm.password.length<6){ElMessage.warning('密码至少6个字符');return};saving.value=true;try{await createUser({...addForm});addVisible.value=false;loadList();ElMessage.success('用户已创建')}catch(e){ElMessage.error(e.message||'创建失败')};saving.value=false}

const pwdVisible=ref(false),resetUser=ref(null),newPwd=ref('')
const openResetPwd=(row)=>{resetUser.value=row;newPwd.value='';pwdVisible.value=true}
const doResetPwd=async()=>{if(!newPwd.value||newPwd.value.length<6){ElMessage.warning('密码至少6个字符');return};saving.value=true;try{await resetUserPassword(resetUser.value._id,newPwd.value);pwdVisible.value=false;ElMessage.success('密码已重置')}catch(e){ElMessage.error(e.message||'重置失败')};saving.value=false}

const doDelete=async(row)=>{try{await deleteUser(row._id);ElMessage.success('已删除');loadList()}catch(e){ElMessage.error(e.message||'删除失败')}}
const fmt=(t)=>t?new Date(t).toLocaleString('zh-CN'):''
</script>

<style lang="scss" scoped>
.user-page .page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;h2{margin:0}}
</style>
