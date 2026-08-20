<template>
  <div class="user-page">
    <div class="page-header"><h2>用户管理</h2><el-button type="primary" @click="openAdd">创建用户</el-button></div>

    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="qf">
        <el-form-item label="类型">
          <el-select v-model="qf.type" placeholder="全部" clearable style="width:130px">
            <el-option label="散户" value="retail" /><el-option label="收单账户" value="collector" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户名"><el-input v-model="qf.keyword" placeholder="搜索" clearable style="width:160px" /></el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="loadList">搜索</el-button>
          <el-button icon="Refresh" @click="qf.type='';qf.keyword='';loadList()">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table :data="list" border stripe v-loading="loading">
        <el-table-column prop="username" label="用户名" width="180" />
        <el-table-column label="类型" width="110">
          <template #default="{row}">
            <el-tag :type="row.type==='collector' ? 'warning' : 'primary'" size="small">
              {{ row.type==='collector' ? '收单账户' : '散户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可用余额" width="130">
          <template #default="{row}"><span style="color:#d32f2f;font-weight:bold">¥{{ Number(row.balance||0).toFixed(2) }}</span></template>
        </el-table-column>
        <el-table-column label="冻结余额" width="110">
          <template #default="{row}">¥{{ Number(row.frozenBalance||0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="row.status==='active'?'success':'danger'">{{ row.status==='active'?'正常':'禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{row}">{{ fmt(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="300">
          <template #default="{row}">
            <el-button size="small" type="success" @click="openRecharge(row)">充值</el-button>
            <el-button size="small" @click="openResetPwd(row)">重置密码</el-button>
            <el-button size="small" :type="row.status==='active'?'warning':'success'" @click="toggleStatus(row)">
              {{ row.status==='active'?'禁用':'启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="page" v-model:page-size="ps" :total="total" layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadList" />
    </el-card>

    <el-dialog title="创建用户" v-model="addVisible" width="420px">
      <el-form :model="addForm" ref="addFormRef" label-width="80px">
        <el-form-item label="用户名"><el-input v-model="addForm.username" placeholder="至少3个字符" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="addForm.password" type="password" show-password placeholder="至少6个字符" /></el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="addForm.type">
            <el-radio value="retail">散户（有钱包，下注校验余额）</el-radio>
            <el-radio value="collector">收单账户（下注不校验余额）</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="addVisible=false">取消</el-button><el-button type="primary" @click="doCreate" :loading="saving">确认创建</el-button></template>
    </el-dialog>

    <el-dialog title="充值" v-model="rechargeVisible" width="420px">
      <el-form label-width="80px">
        <el-form-item label="用户"><el-input :value="rechargeUserInfo?.username" disabled /></el-form-item>
        <el-form-item label="当前余额"><el-input :value="'¥' + Number(rechargeUserInfo?.balance||0).toFixed(2)" disabled /></el-form-item>
        <el-form-item label="充值金额"><el-input-number v-model="rechargeForm.amount" :min="0.01" :precision="2" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="rechargeForm.remark" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="rechargeVisible=false">取消</el-button><el-button type="primary" @click="doRecharge" :loading="saving">确认充值</el-button></template>
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
import { getUserList, createUser, resetUserPassword, rechargeUser, updateUserStatus } from '@/api'

const loading = ref(false), saving = ref(false)
const list = ref([]), page = ref(1), ps = ref(20), total = ref(0)
const qf = reactive({ type: '', keyword: '' })

const loadList = async () => {
  loading.value = true
  try {
    const res = await getUserList({ ...qf, page: page.value, pageSize: ps.value })
    list.value = (res.data.list) || []
    total.value = res.data.total || 0
  } catch (e) { console.error(e) }
  loading.value = false
}
loadList()

const addVisible = ref(false), addFormRef = ref(null), addForm = reactive({ username: '', password: '', type: 'retail' })
const openAdd = () => { Object.assign(addForm, { username: '', password: '', type: 'retail' }); addVisible.value = true }
const doCreate = async () => {
  if (!addForm.username || addForm.username.length < 3) { ElMessage.warning('用户名至少3个字符'); return }
  if (!addForm.password || addForm.password.length < 6) { ElMessage.warning('密码至少6个字符'); return }
  saving.value = true
  try { await createUser({ ...addForm }); addVisible.value = false; loadList(); ElMessage.success('用户已创建') }
  catch (e) { ElMessage.error(e.message || '创建失败') }
  saving.value = false
}

const rechargeVisible = ref(false), rechargeUserInfo = ref(null), rechargeForm = reactive({ amount: 100, remark: '' })
const openRecharge = (row) => { rechargeUserInfo.value = row; rechargeForm.amount = 100; rechargeForm.remark = ''; rechargeVisible.value = true }
const doRecharge = async () => {
  if (!rechargeForm.amount || rechargeForm.amount <= 0) { ElMessage.warning('充值金额无效'); return }
  saving.value = true
  try { await rechargeUser(rechargeUserInfo.value._id, rechargeForm.amount, rechargeForm.remark); rechargeVisible.value = false; loadList(); ElMessage.success('充值成功') }
  catch (e) { ElMessage.error(e.message || '充值失败') }
  saving.value = false
}

const pwdVisible = ref(false), resetUser = ref(null), newPwd = ref('')
const openResetPwd = (row) => { resetUser.value = row; newPwd.value = ''; pwdVisible.value = true }
const doResetPwd = async () => {
  if (!newPwd.value || newPwd.value.length < 6) { ElMessage.warning('密码至少6个字符'); return }
  saving.value = true
  try { await resetUserPassword(resetUser.value._id, newPwd.value); pwdVisible.value = false; ElMessage.success('密码已重置') }
  catch (e) { ElMessage.error(e.message || '重置失败') }
  saving.value = false
}

const toggleStatus = async (row) => {
  const next = row.status === 'active' ? 'disabled' : 'active'
  try { await updateUserStatus(row._id, next); ElMessage.success(next === 'active' ? '已启用' : '已禁用'); loadList() }
  catch (e) { ElMessage.error(e.message || '操作失败') }
}

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''
</script>

<style lang="scss" scoped>
.user-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
</style>
