<template>
  <div class="agent-detail-page">
    <div class="page-header">
      <el-button icon="ArrowLeft" @click="$router.push('/agent')">返回</el-button>
      <h2>代理详情：{{ agent.username || '-' }}</h2>
    </div>

    <el-card v-loading="loading" style="margin-bottom:16px">
      <el-row :gutter="16">
        <el-col :span="6"><div class="kv"><span>代理编号</span><b>{{ agent.agentCode || '-' }}</b></div></el-col>
        <el-col :span="6"><div class="kv"><span>佣金比例</span><b>{{ Number(agent.commissionRate || 0).toFixed(2) }}%</b></div></el-col>
        <el-col :span="6"><div class="kv"><span>状态</span><b>{{ agent.status === 'active' ? '正常' : '禁用' }}</b></div></el-col>
        <el-col :span="6"><div class="kv"><span>创建时间</span><b>{{ fmt(agent.createTime) }}</b></div></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top:16px">
        <el-col :span="4"><div class="stat"><span>用户数</span><b>{{ stats.userCount || 0 }}</b></div></el-col>
        <el-col :span="4"><div class="stat"><span>订单数</span><b>{{ stats.orderCount || 0 }}</b></div></el-col>
        <el-col :span="4"><div class="stat"><span>累计流水</span><b>¥{{ money(stats.totalBet) }}</b></div></el-col>
        <el-col :span="4"><div class="stat"><span>累计中奖</span><b>¥{{ money(stats.totalWin) }}</b></div></el-col>
        <el-col :span="4"><div class="stat"><span>盈亏</span><b>¥{{ money(stats.profit) }}</b></div></el-col>
        <el-col :span="4"><div class="stat"><span>累计佣金</span><b>¥{{ money(stats.commissionTotal) }}</b></div></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top:16px">
        <el-col :span="8"><div class="stat"><span>待结算佣金</span><b>¥{{ money(agent.commissionBalance) }}</b></div></el-col>
        <el-col :span="8"><div class="stat"><span>已支付佣金</span><b>¥{{ money(agent.paidCommission) }}</b></div></el-col>
        <el-col :span="8"><div class="stat"><span>累计产生佣金</span><b>¥{{ money(agent.totalCommission) }}</b></div></el-col>
      </el-row>
    </el-card>

    <el-card>
      <el-tabs v-model="tab">
        <el-tab-pane label="名下用户" name="users">
          <el-form :inline="true" style="margin-bottom:12px">
            <el-form-item label="用户名"><el-input v-model="userQuery.keyword" clearable style="width:160px" /></el-form-item>
            <el-form-item>
              <el-button type="primary" icon="Search" @click="loadUsers">搜索</el-button>
            </el-form-item>
          </el-form>
          <el-table :data="users.list" border stripe v-loading="users.loading">
            <el-table-column prop="username" label="用户名" width="160" />
            <el-table-column label="余额" width="110"><template #default="{row}">¥{{ money(row.balance) }}</template></el-table-column>
            <el-table-column label="累计下注" width="120"><template #default="{row}">¥{{ money(row.totalBet) }}</template></el-table-column>
            <el-table-column label="累计中奖" width="120"><template #default="{row}">¥{{ money(row.totalWin) }}</template></el-table-column>
            <el-table-column prop="orderCount" label="订单数" width="90" />
            <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.status === 'active' ? 'success' : 'danger'">{{ row.status === 'active' ? '正常' : '禁用' }}</el-tag></template></el-table-column>
            <el-table-column label="创建时间" width="170"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
          </el-table>
          <el-pagination v-model:current-page="users.page" v-model:page-size="users.ps" :total="users.total"
            layout="total,prev,pager,next" style="margin-top:12px;justify-content:flex-end" @change="loadUsers" />
        </el-tab-pane>

        <el-tab-pane label="名下订单" name="orders">
          <el-table :data="orders.list" border stripe v-loading="orders.loading">
            <el-table-column prop="orderNo" label="单号" width="175" />
            <el-table-column prop="username" label="用户" width="110" />
            <el-table-column prop="matchName" label="赛事" min-width="140" />
            <el-table-column label="下注额" width="100"><template #default="{row}">¥{{ money(row.betAmount) }}</template></el-table-column>
            <el-table-column label="中奖" width="100"><template #default="{row}">¥{{ money(row.winAmount) }}</template></el-table-column>
            <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="下单时间" width="170"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
          </el-table>
          <el-pagination v-model:current-page="orders.page" v-model:page-size="orders.ps" :total="orders.total"
            layout="total,prev,pager,next" style="margin-top:12px;justify-content:flex-end" @change="loadOrders" />
        </el-tab-pane>

        <el-tab-pane label="佣金明细" name="commission">
          <el-table :data="commission.list" border stripe v-loading="commission.loading">
            <el-table-column prop="orderNo" label="订单号" width="175" />
            <el-table-column prop="userName" label="用户" width="110" />
            <el-table-column label="计佣基数" width="110"><template #default="{row}">¥{{ money(row.baseAmount) }}</template></el-table-column>
            <el-table-column label="比例" width="80"><template #default="{row}">{{ Number(row.rate || 0).toFixed(2) }}%</template></el-table-column>
            <el-table-column label="佣金" width="100"><template #default="{row}">¥{{ money(row.amount) }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{row}"><el-tag>{{ commissionStatus(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="时间" width="170"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
          </el-table>
          <el-pagination v-model:current-page="commission.page" v-model:page-size="commission.ps" :total="commission.total"
            layout="total,prev,pager,next" style="margin-top:12px;justify-content:flex-end" @change="loadCommission" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getAgentDetail, getAgentUsers, getAgentOrders, getAgentCommission } from '@/api'

const route = useRoute()
const agentId = route.params.id
const loading = ref(false)
const tab = ref('users')
const agent = ref({})
const stats = ref({})

const money = (n) => Number(n || 0).toFixed(2)
const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''
const statusType = (s) => ({ pending: 'warning', won: 'success', lost: 'info', settled: 'info', refunded: 'danger' }[s] || 'info')
const statusText = (s) => ({ pending: '待开奖', won: '已中奖', lost: '未中奖', settled: '已结算', refunded: '已退款' }[s] || s)
const commissionStatus = (s) => ({ pending: '待确认', available: '可结算', paid: '已支付', void: '已冲销' }[s] || s)

const loadDetail = async () => {
  loading.value = true
  try {
    const res = await getAgentDetail(agentId)
    agent.value = res.data.agent || {}
    stats.value = res.data.stats || {}
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  loading.value = false
}

const userQuery = reactive({ keyword: '' })
const users = reactive({ list: [], total: 0, page: 1, ps: 20, loading: false })
const loadUsers = async () => {
  users.loading = true
  try {
    const res = await getAgentUsers(agentId, { ...userQuery, page: users.page, pageSize: users.ps })
    users.list = res.data.list || []
    users.total = res.data.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  users.loading = false
}

const orders = reactive({ list: [], total: 0, page: 1, ps: 20, loading: false })
const loadOrders = async () => {
  orders.loading = true
  try {
    const res = await getAgentOrders(agentId, { page: orders.page, pageSize: orders.ps })
    orders.list = res.data.list || []
    orders.total = res.data.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  orders.loading = false
}

const commission = reactive({ list: [], total: 0, page: 1, ps: 20, loading: false })
const loadCommission = async () => {
  commission.loading = true
  try {
    const res = await getAgentCommission(agentId, { page: commission.page, pageSize: commission.ps })
    commission.list = res.data.list || []
    commission.total = res.data.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  commission.loading = false
}

onMounted(() => {
  loadDetail()
  loadUsers()
  loadOrders()
  loadCommission()
})
</script>

<style lang="scss" scoped>
.agent-detail-page .page-header { display:flex; align-items:center; gap:16px; margin-bottom:16px; h2 { margin:0; font-size:20px; } }
.kv { display:flex; flex-direction:column; gap:6px; span { color:#909399; font-size:13px; } b { color:#303133; } }
.stat { background:#f5f7fa; border-radius:8px; padding:12px 16px; display:flex; flex-direction:column; gap:6px; span { color:#909399; font-size:13px; } b { font-size:20px; color:#409EFF; } }
</style>
